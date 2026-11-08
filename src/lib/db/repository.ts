import { and, desc, eq, lt, or } from "drizzle-orm";

import { getDatabase } from "@/lib/db/client";
import { invoiceCreationRequests, invoiceReminderActions, paypalWebhookEvents } from "@/lib/db/schema";
import type { InvoiceDraft } from "@/lib/invoice";
import type { PayPalInvoiceResult, PayPalWebhookEvent } from "@/lib/paypal";
import type { ReminderDelivery } from "@/lib/reminder";

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

export async function getInvoiceRequestStatus(requestId: string, invoiceId: string) {
  const db = getDatabase();
  const [invoice] = await db
    .select({
      id: invoiceCreationRequests.paypalInvoiceId,
      status: invoiceCreationRequests.paypalStatus,
      mode: invoiceCreationRequests.mode,
      draft: invoiceCreationRequests.draft,
    })
    .from(invoiceCreationRequests)
    .where(
      and(
        eq(invoiceCreationRequests.requestId, requestId),
        eq(invoiceCreationRequests.paypalInvoiceId, invoiceId),
        eq(invoiceCreationRequests.state, "COMPLETED"),
      ),
    )
    .limit(1);

  return invoice ?? null;
}

export async function createReminderAction(input: {
  actionId: string;
  invoiceId: string;
  delivery: ReminderDelivery;
  subject?: string;
  message?: string;
  recipientEmail?: string;
}) {
  const db = getDatabase();
  const inserted = await db
    .insert(invoiceReminderActions)
    .values({
      actionId: input.actionId,
      paypalInvoiceId: input.invoiceId,
      delivery: input.delivery,
      state: "SENDING",
      subject: input.subject ?? null,
      message: input.message ?? null,
      recipientEmail: input.recipientEmail ?? null,
    })
    .onConflictDoNothing()
    .returning({ actionId: invoiceReminderActions.actionId });

  return inserted.length > 0;
}

export async function completeReminderAction(actionId: string, providerId: string | null) {
  const db = getDatabase();
  await db
    .update(invoiceReminderActions)
    .set({ state: "SENT", providerId, errorMessage: null, updatedAt: new Date() })
    .where(eq(invoiceReminderActions.actionId, actionId));
}

export async function failReminderAction(actionId: string, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 500) : "Reminder delivery failed";
  const db = getDatabase();
  await db
    .update(invoiceReminderActions)
    .set({ state: "FAILED", errorMessage: message, updatedAt: new Date() })
    .where(eq(invoiceReminderActions.actionId, actionId));
}

export async function listReminderActions(invoiceId: string) {
  const db = getDatabase();
  return db
    .select({
      id: invoiceReminderActions.actionId,
      delivery: invoiceReminderActions.delivery,
      state: invoiceReminderActions.state,
      subject: invoiceReminderActions.subject,
      error: invoiceReminderActions.errorMessage,
      createdAt: invoiceReminderActions.createdAt,
    })
    .from(invoiceReminderActions)
    .where(eq(invoiceReminderActions.paypalInvoiceId, invoiceId))
    .orderBy(desc(invoiceReminderActions.createdAt))
    .limit(10);
}

export async function updateInvoiceStatus(invoiceId: string, status: string) {
  const db = getDatabase();
  await db
    .update(invoiceCreationRequests)
    .set({ paypalStatus: status, updatedAt: new Date() })
    .where(eq(invoiceCreationRequests.paypalInvoiceId, invoiceId));
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
  const nestedInvoice = isRecord(event.resource.invoice) ? event.resource.invoice : event.resource;
  const resourceId = typeof nestedInvoice.id === "string" ? nestedInvoice.id : null;
  const resourceStatus = typeof nestedInvoice.status === "string" ? nestedInvoice.status : null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
