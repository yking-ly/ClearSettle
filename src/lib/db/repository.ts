import { and, eq, lt, or } from "drizzle-orm";

import { getDatabase } from "@/lib/db/client";
import { invoiceCreationRequests, paypalWebhookEvents } from "@/lib/db/schema";
import type { InvoiceDraft } from "@/lib/invoice";
import type { PayPalInvoiceResult, PayPalWebhookEvent } from "@/lib/paypal";

export type InvoiceClaim =
  | { outcome: "claimed" }
  | { outcome: "completed"; result: PayPalInvoiceResult }
  | { outcome: "conflict" }
  | { outcome: "in_progress" };

export async function claimInvoiceRequest(requestId: string, requestHash: string, draft: InvoiceDraft): Promise<InvoiceClaim> {
  const db = getDatabase();
  const inserted = await db
    .insert(invoiceCreationRequests)
    .values({ requestId, requestHash, state: "CREATING", draft })
    .onConflictDoNothing()
    .returning({ requestId: invoiceCreationRequests.requestId });

  if (inserted.length) return { outcome: "claimed" };

  const [existing] = await db.select().from(invoiceCreationRequests).where(eq(invoiceCreationRequests.requestId, requestId)).limit(1);
  if (!existing || existing.requestHash !== requestHash) return { outcome: "conflict" };

  if (
    existing.state === "COMPLETED" &&
    existing.paypalInvoiceId &&
    existing.paypalStatus &&
    existing.mode
  ) {
    return {
      outcome: "completed",
      result: {
        id: existing.paypalInvoiceId,
        status: existing.paypalStatus,
        mode: existing.mode,
        href: existing.href,
      },
    };
  }

  const staleBefore = new Date(Date.now() - 2 * 60_000);
  const reclaimed = await db
    .update(invoiceCreationRequests)
    .set({ state: "CREATING", errorMessage: null, updatedAt: new Date() })
    .where(
      and(
        eq(invoiceCreationRequests.requestId, requestId),
        or(
          eq(invoiceCreationRequests.state, "FAILED"),
          and(eq(invoiceCreationRequests.state, "CREATING"), lt(invoiceCreationRequests.updatedAt, staleBefore)),
        ),
      ),
    )
    .returning({ requestId: invoiceCreationRequests.requestId });

  return reclaimed.length ? { outcome: "claimed" } : { outcome: "in_progress" };
}

export async function completeInvoiceRequest(requestId: string, result: PayPalInvoiceResult) {
  const db = getDatabase();
  await db
    .update(invoiceCreationRequests)
    .set({
      state: "COMPLETED",
      paypalInvoiceId: result.id,
      paypalStatus: result.status,
      mode: result.mode,
      href: result.href,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(invoiceCreationRequests.requestId, requestId));
}

export async function failInvoiceRequest(requestId: string, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 500) : "Invoice creation failed";
  const db = getDatabase();
  await db
    .update(invoiceCreationRequests)
    .set({ state: "FAILED", errorMessage: message, updatedAt: new Date() })
    .where(and(eq(invoiceCreationRequests.requestId, requestId), eq(invoiceCreationRequests.state, "CREATING")));
}

export async function storePayPalWebhook(event: PayPalWebhookEvent) {
  const db = getDatabase();
  const resourceId = typeof event.resource.id === "string" ? event.resource.id : null;
  const resourceStatus = typeof event.resource.status === "string" ? event.resource.status : null;
  const eventCreatedAt = event.create_time ? new Date(event.create_time) : null;

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(paypalWebhookEvents)
      .values({
        eventId: event.id,
        eventType: event.event_type,
        resourceType: event.resource_type ?? null,
        resourceId,
        summary: event.summary ?? null,
        eventCreatedAt,
        payload: event,
      })
      .onConflictDoNothing()
      .returning({ eventId: paypalWebhookEvents.eventId });

    if (!inserted.length) return false;

    if (resourceId && resourceStatus && event.event_type.startsWith("INVOICING.INVOICE.")) {
      await tx
        .update(invoiceCreationRequests)
        .set({ paypalStatus: resourceStatus, updatedAt: new Date() })
        .where(eq(invoiceCreationRequests.paypalInvoiceId, resourceId));
    }

    return true;
  });
}
