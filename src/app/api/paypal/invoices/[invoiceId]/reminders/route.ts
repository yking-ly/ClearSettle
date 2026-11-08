import { NextResponse } from "next/server";
import { z } from "zod";

import { isDatabaseConfigured } from "@/lib/db/client";
import {
  completeReminderAction,
  createReminderAction,
  failReminderAction,
  getInvoiceRequestStatus,
  listReminderActions,
} from "@/lib/db/repository";
import { reminderRecipient, sendReminderEmail } from "@/lib/email";
import { getPayPalInvoicePayerViewUrl, sendPayPalInvoiceReminder } from "@/lib/paypal";
import { isRemindableInvoiceStatus, reminderDeliverySchema } from "@/lib/reminder";

const invoiceIdSchema = z.string().regex(/^INV2-[A-Z0-9-]+$/);
const requestIdSchema = z.string().uuid();
type Context = { params: Promise<{ invoiceId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const invoice = await authorizedInvoice(request, context);
    return NextResponse.json({ actions: await listReminderActions(invoice.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  const actionId = requestIdSchema.safeParse(request.headers.get("idempotency-key"));
  if (!actionId.success) return NextResponse.json({ error: "A valid idempotency key is required" }, { status: 400 });

  let claimed = false;
  try {
    const invoice = await authorizedInvoice(request, context);
    if (invoice.mode !== "paypal" || !invoice.id) throw new Error("Only PayPal invoices can receive reminders");
    if (!invoice.status || !isRemindableInvoiceStatus(invoice.status)) throw new InvoiceStateError(invoice.status);

    const delivery = reminderDeliverySchema.parse(await request.json());
    const invoiceEmail = delivery.delivery === "email" ? invoice.draft.customer_email : null;
    if (delivery.delivery === "email" && !invoiceEmail) throw new Error("The invoice does not have a customer email");
    const recipientEmail = invoiceEmail ? reminderRecipient(invoiceEmail) : null;

    claimed = await createReminderAction({
      actionId: actionId.data,
      invoiceId: invoice.id,
      delivery: delivery.delivery,
      subject: delivery.delivery === "email" ? delivery.subject : undefined,
      message: delivery.delivery === "email" ? delivery.message : undefined,
      recipientEmail: recipientEmail ?? undefined,
    });
    if (!claimed) return NextResponse.json({ error: "This reminder request was already submitted" }, { status: 409 });

    let providerId: string | null;
    if (delivery.delivery === "paypal") {
      await sendPayPalInvoiceReminder(invoice.id);
      providerId = invoice.id;
    } else {
      const paymentUrl = await getPayPalInvoicePayerViewUrl(invoice.id);
      providerId = await sendReminderEmail({
        to: recipientEmail!,
        subject: delivery.subject,
        message: delivery.message,
        paymentUrl,
        idempotencyKey: actionId.data,
      });
    }

    await completeReminderAction(actionId.data, providerId);
    return NextResponse.json({ id: actionId.data, delivery: delivery.delivery, state: "SENT" });
  } catch (error) {
    if (claimed) {
      try {
        await failReminderAction(actionId.data, error);
      } catch (persistenceError) {
        console.error("Unable to record failed reminder delivery", persistenceError);
      }
    }
    return errorResponse(error);
  }
}

async function authorizedInvoice(request: Request, context: Context) {
  if (!isDatabaseConfigured()) throw new Error("Database setup is required to manage reminders");
  const { invoiceId } = await context.params;
  const validInvoiceId = invoiceIdSchema.parse(invoiceId);
  const requestId = requestIdSchema.parse(request.headers.get("invoice-request-id"));
  const invoice = await getInvoiceRequestStatus(requestId, validInvoiceId);
  if (!invoice?.id) throw new InvoiceNotFoundError();
  return { ...invoice, id: invoice.id };
}

function errorResponse(error: unknown) {
  if (error instanceof InvoiceNotFoundError) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (error instanceof InvoiceStateError) {
    return NextResponse.json({ error: `Reminders cannot be sent while the invoice is ${error.status || "in this state"}` }, { status: 409 });
  }
  const message = error instanceof Error ? error.message : "Unable to manage the reminder";
  return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 502 });
}

class InvoiceNotFoundError extends Error {}
class InvoiceStateError extends Error {
  constructor(readonly status: string | null) {
    super(status || "Invalid invoice state");
  }
}
