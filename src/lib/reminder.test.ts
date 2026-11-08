import { describe, expect, it } from "vitest";

import { createDemoReminder, daysPastDue, isRemindableInvoiceStatus, reminderDraftSchema } from "./reminder";

const context = {
  invoice_id: "INV2-ABCD-EFGH-IJKL-MNOP",
  customer_name: "Acme Corp",
  currency: "USD",
  amount: "1250.00",
  due_date: "2026-10-30",
  status: "UNPAID",
};

describe("invoice reminders", () => {
  it("identifies overdue invoices using calendar days", () => {
    expect(daysPastDue(context.due_date, new Date("2026-11-01T18:00:00Z"))).toBe(2);
  });

  it("creates a valid firm reminder for an overdue invoice", () => {
    const reminder = createDemoReminder(context, new Date("2026-11-01T00:00:00Z"));
    expect(reminderDraftSchema.parse(reminder).tone).toBe("firm");
    expect(reminder.message).toContain("2 days ago");
  });

  it("only permits reminders for payable invoice states", () => {
    expect(isRemindableInvoiceStatus("UNPAID")).toBe(true);
    expect(isRemindableInvoiceStatus("PARTIALLY_PAID")).toBe(true);
    expect(isRemindableInvoiceStatus("DRAFT")).toBe(false);
    expect(isRemindableInvoiceStatus("PAID")).toBe(false);
  });
});
