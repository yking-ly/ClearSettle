import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { createDemoDraft, invoiceDraftSchema, type InvoiceDraft } from "@/lib/invoice";

export async function extractInvoice(prompt: string): Promise<{ draft: InvoiceDraft; mode: "ai" | "demo" }> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    if (process.env.DEMO_MODE === "true") {
      return { draft: createDemoDraft(prompt), mode: "demo" };
    }
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const client = new OpenAI({ apiKey });
  const response = await client.responses.parse({
    model: process.env.OPENAI_MODEL || "gpt-6-astra",
    input: [
      {
        role: "system",
        content: [
          "Extract a draft invoice from the user's request.",
          "Never invent a customer email, due date, amount, or customer name.",
          "Use null for missing nullable fields and name each missing field in missing_fields.",
          "Amounts must be decimal strings without currency symbols.",
          "Default currency to USD only when no currency is stated.",
          "If the request is unrelated to invoicing, set is_invoice_request to false and summarize what is missing.",
          `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
        ].join(" "),
      },
      { role: "user", content: prompt },
    ],
    text: { format: zodTextFormat(invoiceDraftSchema, "invoice_draft") },
  });

  if (!response.output_parsed) {
    throw new Error("The AI did not return a usable invoice draft");
  }

  return { draft: invoiceDraftSchema.parse(response.output_parsed), mode: "ai" };
}
