import { z } from "zod";

export const reminderContextSchema = z.object({
  invoice_id: z.string().regex(/^INV2-[A-Z0-9-]+$/),
  customer_name: z.string().trim().min(1).max(300),
  currency: z.string().regex(/^[A-Z]{3}$/),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  due_date: z.string().date().nullable(),
  status: z.string().trim().min(1).max(100),
});

export const reminderDraftSchema = z.object({
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(20).max(2_000),
  tone: z.enum(["gentle", "firm"]),
  rationale: z.string().trim().min(1).max(300),
});

export const reminderDeliverySchema = z.discriminatedUnion("delivery", [
  z.object({ delivery: z.literal("paypal") }),
  z.object({
    delivery: z.literal("email"),
    subject: reminderDraftSchema.shape.subject,
    message: reminderDraftSchema.shape.message,
  }),
]);

export type ReminderContext = z.infer<typeof reminderContextSchema>;
export type ReminderDraft = z.infer<typeof reminderDraftSchema>;
export type ReminderDelivery = z.infer<typeof reminderDeliverySchema>["delivery"];

export const remindableInvoiceStatuses = new Set(["SENT", "UNPAID", "PARTIALLY_PAID", "PAYMENT_PENDING"]);

export function isRemindableInvoiceStatus(status: string) {
  return remindableInvoiceStatuses.has(status);
}

export function daysPastDue(dueDate: string | null, today = new Date()) {
  if (!dueDate) return 0;
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const current = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.max(0, Math.floor((current - due) / 86_400_000));
}

export function createDemoReminder(context: ReminderContext, today = new Date()): ReminderDraft {
  const overdueDays = daysPastDue(context.due_date, today);
  const duePhrase = overdueDays
    ? `was due ${overdueDays} day${overdueDays === 1 ? "" : "s"} ago`
    : context.due_date
      ? `is due on ${context.due_date}`
      : "is ready for payment";

  return {
    subject: `Reminder: PayPal invoice ${context.invoice_id}`,
    message: [
      `Hi ${context.customer_name},`,
      "",
      `This is a ${overdueDays ? "follow-up" : "friendly reminder"} that PayPal invoice ${context.invoice_id} for ${context.currency} ${context.amount} ${duePhrase}.`,
      "Please use the secure PayPal payment link below when convenient. If you have already paid, please disregard this message.",
      "",
      "Thank you.",
    ].join("\n"),
    tone: overdueDays ? "firm" : "gentle",
    rationale: overdueDays
      ? `The invoice is ${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue, so the reminder is direct but respectful.`
      : "The invoice is not overdue, so the reminder stays friendly and low-pressure.",
  };
}
