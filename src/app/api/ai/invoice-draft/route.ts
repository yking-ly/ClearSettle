import { NextResponse } from "next/server";

import { extractInvoice } from "@/lib/ai/invoice-extractor";
import { invoiceRequestSchema } from "@/lib/invoice";

export async function POST(request: Request) {
  try {
    const { prompt } = invoiceRequestSchema.parse(await request.json());
    return NextResponse.json(await extractInvoice(prompt));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create an invoice draft";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
