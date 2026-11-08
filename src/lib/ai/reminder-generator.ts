import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import {
  createDemoReminder,
  reminderContextSchema,
  reminderDraftSchema,
  type ReminderContext,
  type ReminderDraft,
} from "@/lib/reminder";

export async function generateReminder(context: ReminderContext): Promise<{ reminder: ReminderDraft; mode: "ai" | "demo" }> {
  const validContext = reminderContextSchema.parse(context);
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    if (process.env.DEMO_MODE === "true") {
      return { reminder: createDemoReminder(validContext), mode: "demo" };
    }
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const client = new GoogleGenAI({ apiKey });
  const response = await client.interactions.create(
    {
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
      input: JSON.stringify(validContext),
      system_instruction: [
        "Write a concise payment reminder for this PayPal invoice.",
        "Return recipient-ready plain text, a short email subject, a gentle or firm tone, and a one-sentence rationale for the merchant.",
        "Never invent payment history, fees, disputes, consequences, or customer details.",
        "Do not include a URL; the server appends the verified PayPal payment link after approval.",
        "Be respectful and state that the customer can disregard the reminder if payment was already made.",
        `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
      ].join(" "),
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: z.toJSONSchema(reminderDraftSchema),
      },
      store: false,
    },
    { timeout: 30_000 },
  );

  if (!response.output_text) throw new Error("The AI did not return a usable reminder");
  return { reminder: reminderDraftSchema.parse(JSON.parse(response.output_text)), mode: "ai" };
}
