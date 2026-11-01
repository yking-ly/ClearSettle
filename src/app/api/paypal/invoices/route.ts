import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isDatabaseConfigured } from "@/lib/db/client";
import { claimInvoiceRequest, completeInvoiceRequest, failInvoiceRequest } from "@/lib/db/repository";
import { invoiceDraftSchema } from "@/lib/invoice";
import { createPayPalInvoice, isPayPalConfigured } from "@/lib/paypal";

const idempotencyKeySchema = z.string().uuid();

export async function POST(request: Request) {
  let requestId: string | undefined;
  try {
    const draft = invoiceDraftSchema.parse(await request.json());
    if (!draft.is_invoice_request) {
      return NextResponse.json({ error: "This is not a valid invoice request" }, { status: 400 });
    }

    requestId = idempotencyKeySchema.parse(request.headers.get("idempotency-key"));

    if (isPayPalConfigured() && !isDatabaseConfigured()) {
      return NextResponse.json(
        { error: "Database setup is required before creating real PayPal invoices" },
        { status: 503 },
      );
    }

    if (isDatabaseConfigured()) {
      const requestHash = createHash("sha256").update(JSON.stringify(draft)).digest("hex");
      const claim = await claimInvoiceRequest(requestId, requestHash, draft);

      if (claim.outcome === "completed") return NextResponse.json(claim.result);
      if (claim.outcome === "conflict") {
        return NextResponse.json({ error: "This idempotency key was already used for different invoice data" }, { status: 409 });
      }
      if (claim.outcome === "in_progress") {
        return NextResponse.json(
          { error: "This invoice is already being created. Retry shortly." },
          { status: 409, headers: { "Retry-After": "5" } },
        );
      }
    }

    const result = await createPayPalInvoice(draft, requestId);
    if (isDatabaseConfigured()) await completeInvoiceRequest(requestId, result);
    return NextResponse.json(result);
  } catch (error) {
    if (requestId && isDatabaseConfigured()) {
      try {
        await failInvoiceRequest(requestId, error);
      } catch (persistenceError) {
        console.error("Unable to record failed invoice creation", persistenceError);
      }
    }

    const message = error instanceof Error ? error.message : "Unable to create the PayPal invoice";
    const status = error instanceof z.ZodError ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
