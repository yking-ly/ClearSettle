import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { InvoiceDraft } from "@/lib/invoice";
import type { PayPalWebhookEvent } from "@/lib/paypal";

export const invoiceCreationRequests = pgTable("invoice_creation_requests", {
  requestId: uuid("request_id").primaryKey(),
  requestHash: text("request_hash").notNull(),
  state: text("state").$type<"CREATING" | "COMPLETED" | "FAILED">().notNull(),
  paypalInvoiceId: text("paypal_invoice_id").unique(),
  paypalStatus: text("paypal_status"),
  mode: text("mode").$type<"demo" | "paypal">(),
  href: text("href"),
  draft: jsonb("draft").$type<InvoiceDraft>().notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const paypalWebhookEvents = pgTable(
  "paypal_webhook_events",
  {
    eventId: text("event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    summary: text("summary"),
    eventCreatedAt: timestamp("event_created_at", { withTimezone: true }),
    payload: jsonb("payload").$type<PayPalWebhookEvent>().notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("paypal_webhook_events_resource_id_idx").on(table.resourceId), index("paypal_webhook_events_received_at_idx").on(table.receivedAt)],
);
