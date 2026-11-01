import { NextResponse } from "next/server";
import { z } from "zod";

import { isDatabaseConfigured } from "@/lib/db/client";
import { getInvoiceRequestStatus, updateInvoiceStatus } from "@/lib/db/repository";
import { sendPayPalInvoice } from "@/lib/paypal";

const invoiceIdSchema = z.string().regex(/^INV2-[A-Z0-9-]+$/);
const requestIdSchema = z.string().uuid();

type Context = { params: Promise<{ invoiceId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const invoice = await authorizedInvoice(request, context);
    return NextResponse.json({ id: invoice.id, status: invoice.status, payerViewUrl: null });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const invoice = await authorizedInvoice(request, context);
    if (invoice.mode !== "paypal" || !invoice.id) throw new Error("Only PayPal invoices can be sent");

    const result = await sendPayPalInvoice(invoice.id);
    await updateInvoiceStatus(invoice.id, result.status);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

async function authorizedInvoice(request: Request, context: Context) {
  if (!isDatabaseConfigured()) throw new Error("Database setup is required to manage PayPal invoices");

  const { invoiceId } = await context.params;
  const validInvoiceId = invoiceIdSchema.parse(invoiceId);
  const requestId = requestIdSchema.parse(request.headers.get("invoice-request-id"));
  const invoice = await getInvoiceRequestStatus(requestId, validInvoiceId);
  if (!invoice) throw new InvoiceNotFoundError();
  return invoice;
}

function errorResponse(error: unknown) {
  if (error instanceof InvoiceNotFoundError) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  const message = error instanceof Error ? error.message : "Unable to manage the PayPal invoice";
  const status = error instanceof z.ZodError ? 400 : 502;
  return NextResponse.json({ error: message }, { status });
}

class InvoiceNotFoundError extends Error {}
