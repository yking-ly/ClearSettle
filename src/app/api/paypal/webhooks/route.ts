import { NextResponse } from "next/server";

import { isDatabaseConfigured } from "@/lib/db/client";
import { storePayPalWebhook } from "@/lib/db/repository";
import {
  isFreshPayPalTransmission,
  paypalWebhookEventSchema,
  readPayPalWebhookHeaders,
  verifyPayPalWebhookSignature,
} from "@/lib/paypal";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Webhook storage is unavailable" }, { status: 503 });
  }

  let event;
  let signatureHeaders;
  try {
    const rawBody = await request.text();
    event = paypalWebhookEventSchema.parse(JSON.parse(rawBody));
    signatureHeaders = readPayPalWebhookHeaders(request.headers);
  } catch {
    return NextResponse.json({ error: "Invalid PayPal webhook request" }, { status: 400 });
  }

  if (!isFreshPayPalTransmission(signatureHeaders.transmissionTime)) {
    return NextResponse.json({ error: "Stale PayPal webhook transmission" }, { status: 401 });
  }

  try {
    const verified = await verifyPayPalWebhookSignature(event, signatureHeaders);
    if (!verified) return NextResponse.json({ error: "Invalid PayPal webhook signature" }, { status: 401 });

    const inserted = await storePayPalWebhook(event);
    return NextResponse.json({ received: true, duplicate: !inserted });
  } catch (error) {
    console.error("PayPal webhook processing failed", error);
    return NextResponse.json({ error: "Webhook processing is temporarily unavailable" }, { status: 503 });
  }
}
