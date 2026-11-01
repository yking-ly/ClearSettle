import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { closeDatabase, getDatabase } from "@/lib/db/client";
import { invoiceCreationRequests, paypalWebhookEvents } from "@/lib/db/schema";
import {
  claimInvoiceRequest,
  completeInvoiceRequest,
  getInvoiceRequestStatus,
  storePayPalWebhook,
  updateInvoiceStatus,
} from "@/lib/db/repository";
import type { InvoiceDraft } from "@/lib/invoice";

const runWithDatabase = Boolean(process.env.DATABASE_URL);
const requestIds: string[] = [];
const eventIds: string[] = [];

const draft: InvoiceDraft = {
  is_invoice_request: true,
  customer_name: "Integration Test",
  customer_email: "integration@example.com",
  currency: "USD",
  items: [{ description: "Database verification", quantity: 1, unit_amount: "1.00" }],
  due_date: null,
  note: null,
  missing_fields: [],
  summary: "Synthetic integration-test invoice.",
};

describe.runIf(runWithDatabase)("PostgreSQL persistence", () => {
  afterEach(async () => {
    const db = getDatabase();
    for (const eventId of eventIds.splice(0)) {
      await db.delete(paypalWebhookEvents).where(eq(paypalWebhookEvents.eventId, eventId));
    }
    for (const requestId of requestIds.splice(0)) {
      await db.delete(invoiceCreationRequests).where(eq(invoiceCreationRequests.requestId, requestId));
    }
  });

  afterAll(closeDatabase);

  it("returns the completed invoice for a repeated idempotency key", async () => {
    const requestId = randomUUID();
    requestIds.push(requestId);

    expect(await claimInvoiceRequest(requestId, "same-payload", draft)).toEqual({ outcome: "claimed" });
    await completeInvoiceRequest(requestId, {
      id: `DEMO-${requestId.slice(0, 8)}`,
      status: "DRAFT",
      mode: "demo",
      href: null,
    });

    expect(await claimInvoiceRequest(requestId, "same-payload", draft)).toMatchObject({
      outcome: "completed",
      result: { status: "DRAFT", mode: "demo" },
    });
    expect(await claimInvoiceRequest(requestId, "changed-payload", draft)).toEqual({ outcome: "conflict" });
  });

  it("stores a PayPal event ID exactly once", async () => {
    const requestId = randomUUID();
    requestIds.push(requestId);
    await claimInvoiceRequest(requestId, "webhook-payload", draft);
    await completeInvoiceRequest(requestId, {
      id: "INV2-INTEGRATION-TEST",
      status: "DRAFT",
      mode: "paypal",
      href: null,
    });

    const eventId = `WH-TEST-${randomUUID()}`;
    eventIds.push(eventId);
    const event = {
      id: eventId,
      event_type: "INVOICING.INVOICE.PAID",
      create_time: new Date().toISOString(),
      resource_type: "invoice",
      resource: { invoice: { id: "INV2-INTEGRATION-TEST", status: "PAID" } },
    };

    expect(await storePayPalWebhook(event)).toBe(true);
    expect(await storePayPalWebhook(event)).toBe(false);

    const db = getDatabase();
    const [storedEvent] = await db
      .select()
      .from(paypalWebhookEvents)
      .where(eq(paypalWebhookEvents.eventId, eventId));
    const [updatedInvoice] = await db
      .select()
      .from(invoiceCreationRequests)
      .where(eq(invoiceCreationRequests.requestId, requestId));

    expect(storedEvent.resourceId).toBe("INV2-INTEGRATION-TEST");
    expect(updatedInvoice.paypalStatus).toBe("PAID");
  });

  it("authorizes status access by request ID and updates delivery status", async () => {
    const requestId = randomUUID();
    requestIds.push(requestId);
    await claimInvoiceRequest(requestId, "status-payload", draft);
    await completeInvoiceRequest(requestId, {
      id: "INV2-STATUS-TEST",
      status: "DRAFT",
      mode: "paypal",
      href: null,
    });

    expect(await getInvoiceRequestStatus(randomUUID(), "INV2-STATUS-TEST")).toBeNull();
    expect(await getInvoiceRequestStatus(requestId, "INV2-STATUS-TEST")).toMatchObject({ status: "DRAFT" });

    await updateInvoiceStatus("INV2-STATUS-TEST", "SENT");
    expect(await getInvoiceRequestStatus(requestId, "INV2-STATUS-TEST")).toMatchObject({ status: "SENT" });
  });
});
