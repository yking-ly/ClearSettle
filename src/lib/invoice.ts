import { z } from "zod";

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.number().positive().max(1_000),
  unit_amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Use a positive amount with at most two decimals"),
});

export const invoiceDraftSchema = z.object({
  is_invoice_request: z.boolean(),
  customer_name: z.string().trim().min(1).max(120).nullable(),
  customer_email: z.string().email().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  items: z.array(invoiceItemSchema).min(1).max(20),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  note: z.string().trim().max(500).nullable(),
  missing_fields: z.array(z.string()).max(10),
  summary: z.string().trim().min(1).max(300),
});

export const invoiceRequestSchema = z.object({
  prompt: z.string().trim().min(10).max(2_000),
});

export type InvoiceDraft = z.infer<typeof invoiceDraftSchema>;

export function invoiceTotal(draft: InvoiceDraft) {
  const cents = draft.items.reduce((sum, item) => {
    const [whole, fraction = ""] = item.unit_amount.split(".");
    const unitCents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    return sum + Math.round(unitCents * item.quantity);
  }, 0);

  return (cents / 100).toFixed(2);
}

export function createDemoDraft(prompt: string): InvoiceDraft {
  const amount = (prompt.match(/(?:\$|USD\s*)(\d[\d,]*(?:\.\d{1,2})?)/i)?.[1] ?? "1200.00").replaceAll(",", "");
  const email = prompt.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] ?? null;
  const customer = prompt.match(/(?:invoice|bill)\s+([A-Z][\w]*(?:\s+[A-Z][\w]*){0,3})/i)?.[1] ?? null;

  return {
    is_invoice_request: true,
    customer_name: customer,
    customer_email: email,
    currency: "USD",
    items: [{ description: "Professional services", quantity: 1, unit_amount: amount }],
    due_date: null,
    note: null,
    missing_fields: [
      ...(customer ? [] : ["customer_name"]),
      ...(email ? [] : ["customer_email"]),
      "due_date",
    ],
    summary: "Demo extraction created a draft. Add an OpenAI API key for full natural-language extraction.",
  };
}
