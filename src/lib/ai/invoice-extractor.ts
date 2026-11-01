import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { createDemoDraft, invoiceDraftSchema, type InvoiceDraft } from "@/lib/invoice";

export async function extractInvoice(prompt: string): Promise<{ draft: InvoiceDraft; mode: "ai" | "demo" }> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    if (process.env.DEMO_MODE === "true") {
      return { draft: createDemoDraft(prompt), mode: "demo" };
    }
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const client = new GoogleGenAI({ apiKey });
  const response = await client.interactions.create(
    {
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
      input: prompt,
      system_instruction: [
        "Extract a draft invoice from the user's request.",
        "Never invent a customer email, due date, amount, or customer name.",
        "Use null for missing nullable fields and name each missing field in missing_fields.",
        "Amounts must be decimal strings without currency symbols.",
        "Default currency to USD only when no currency is stated.",
        "If the request is unrelated to invoicing, set is_invoice_request to false and summarize what is missing.",
        `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
      ].join(" "),
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: z.toJSONSchema(invoiceDraftSchema),
      },
      store: false,
    },
    { timeout: 30_000 },
  );

  if (!response.output_text) {
    throw new Error("The AI did not return a usable invoice draft");
  }

  return { draft: invoiceDraftSchema.parse(JSON.parse(response.output_text)), mode: "ai" };
}
