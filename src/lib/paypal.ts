import { createVerify, X509Certificate } from "node:crypto";

import type { InvoiceDraft } from "@/lib/invoice";
import { z } from "zod";

type Token = { value: string; expiresAt: number };
let cachedToken: Token | undefined;
const certificateCache = new Map<string, { pem: string; expiresAt: number }>();

export type PayPalInvoiceResult = {
  id: string;
  status: string;
  mode: "demo" | "paypal";
  href: string | null;
};

export type PayPalInvoiceDelivery = {
  id: string;
  status: string;
  payerViewUrl: string | null;
};

export function paypalPaymentTerm(dueDate: string | null) {
  return dueDate
    ? { term_type: "DUE_ON_DATE_SPECIFIED" as const, due_date: dueDate }
    : { term_type: "DUE_ON_RECEIPT" as const };
}

export const paypalWebhookEventSchema = z
  .object({
    id: z.string().min(1).max(200),
    event_type: z.string().min(1).max(200),
    create_time: z.string().datetime().optional(),
    resource_type: z.string().max(200).optional(),
    summary: z.string().max(500).optional(),
    resource: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export type PayPalWebhookEvent = z.infer<typeof paypalWebhookEventSchema>;

export type PayPalWebhookHeaders = {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
};

function baseUrl() {
  return process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function isPayPalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("PayPal credentials are not configured");

  const response = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error(`PayPal authentication failed (${response.status})`);
  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1_000 };
  return data.access_token;
}

export async function createPayPalInvoice(draft: InvoiceDraft, requestId: string): Promise<PayPalInvoiceResult> {
  if (!isPayPalConfigured()) {
    if (process.env.DEMO_MODE === "true") {
      return {
        id: `DEMO-${requestId.slice(0, 8).toUpperCase()}`,
        status: "DRAFT",
        mode: "demo" as const,
        href: null,
      };
    }
    throw new Error("PayPal credentials are not configured");
  }

  if (!draft.customer_email || !draft.customer_name) {
    throw new Error("Customer name and email are required before creating a PayPal invoice");
  }

  const token = await accessToken();
  const response = await fetch(`${baseUrl()}/v2/invoicing/invoices`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
    },
    body: JSON.stringify({
      detail: {
        currency_code: draft.currency,
        note: draft.note || undefined,
        payment_term: paypalPaymentTerm(draft.due_date),
      },
      primary_recipients: [
        {
          billing_info: {
            name: { full_name: draft.customer_name },
            email_address: draft.customer_email,
          },
        },
      ],
      items: draft.items.map((item) => ({
        name: item.description,
        quantity: String(item.quantity),
        unit_amount: { currency_code: draft.currency, value: item.unit_amount },
      })),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  const data = (await response.json()) as {
    id?: string;
    status?: string;
    href?: string;
    links?: Array<{ rel: string; href: string }>;
    message?: string;
  };
  const resourceHref = data.href ?? data.links?.find((link) => link.rel === "self")?.href ?? null;
  const invoiceId = data.id ?? invoiceIdFromHref(resourceHref);

  if (!response.ok || !invoiceId) {
    throw new Error(data.message || `PayPal invoice creation failed (${response.status})`);
  }

  return {
    id: invoiceId,
    status: data.status || "DRAFT",
    mode: "paypal" as const,
    href: resourceHref,
  };
}

export async function sendPayPalInvoice(invoiceId: string): Promise<PayPalInvoiceDelivery> {
  const token = await accessToken();
  const response = await fetch(`${baseUrl()}/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ send_to_invoicer: false, send_to_recipient: true }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  const data = (await response.json()) as { href?: string; rel?: string; message?: string };
  if (!response.ok) throw new Error(data.message || `PayPal invoice sending failed (${response.status})`);

  return {
    id: invoiceId,
    status: "SENT",
    payerViewUrl: data.rel === "payer-view" && data.href ? data.href : null,
  };
}

export function invoiceIdFromHref(href: string | null) {
  return href?.match(/INV2-[A-Z0-9-]+/)?.[0] ?? null;
}

export function readPayPalWebhookHeaders(headers: Headers): PayPalWebhookHeaders {
  const values = {
    authAlgo: headers.get("paypal-auth-algo"),
    certUrl: headers.get("paypal-cert-url"),
    transmissionId: headers.get("paypal-transmission-id"),
    transmissionSig: headers.get("paypal-transmission-sig"),
    transmissionTime: headers.get("paypal-transmission-time"),
  };

  if (Object.values(values).some((value) => !value)) {
    throw new Error("Missing required PayPal signature headers");
  }

  if (!isAllowedPayPalCertificateUrl(values.certUrl!)) {
    throw new Error("Invalid PayPal certificate URL");
  }

  return values as PayPalWebhookHeaders;
}

export function isFreshPayPalTransmission(transmissionTime: string, now = Date.now()) {
  const sentAt = Date.parse(transmissionTime);
  return Number.isFinite(sentAt) && Math.abs(now - sentAt) <= 5 * 60_000;
}

export function paypalWebhookVerificationMessage(
  rawBody: string,
  headers: PayPalWebhookHeaders,
  webhookId: string,
) {
  return `${headers.transmissionId}|${headers.transmissionTime}|${webhookId}|${crc32(Buffer.from(rawBody, "utf8"))}`;
}

export function verifyPayPalSignature(message: string, transmissionSignature: string, certificate: string) {
  const verifier = createVerify("SHA256");
  verifier.update(message);
  verifier.end();
  return verifier.verify(certificate, Buffer.from(transmissionSignature, "base64"));
}

export async function verifyPayPalWebhookSignature(rawBody: string, headers: PayPalWebhookHeaders) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID is not configured");
  if (headers.authAlgo !== "SHA256withRSA") return false;

  const certificate = await getPayPalCertificate(headers.certUrl);
  const message = paypalWebhookVerificationMessage(rawBody, headers, webhookId);
  return verifyPayPalSignature(message, headers.transmissionSig, certificate);
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function getPayPalCertificate(certUrl: string) {
  const now = Date.now();
  const cached = certificateCache.get(certUrl);
  if (cached && cached.expiresAt > now) return cached.pem;

  const response = await fetch(certUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Unable to retrieve PayPal certificate (${response.status})`);

  const pem = await response.text();
  const certificate = new X509Certificate(pem);
  const validFrom = Date.parse(certificate.validFrom);
  const validTo = Date.parse(certificate.validTo);
  if (!Number.isFinite(validFrom) || !Number.isFinite(validTo) || now < validFrom || now > validTo) {
    throw new Error("PayPal signing certificate is not currently valid");
  }

  certificateCache.set(certUrl, { pem, expiresAt: Math.min(validTo, now + 6 * 60 * 60_000) });
  return pem;
}

function isAllowedPayPalCertificateUrl(value: string) {
  try {
    const url = new URL(value);
    const allowedHosts =
      process.env.PAYPAL_ENV === "live"
        ? new Set(["api.paypal.com", "api-m.paypal.com"])
        : new Set(["api.sandbox.paypal.com", "api-m.sandbox.paypal.com"]);
    return url.protocol === "https:" && allowedHosts.has(url.hostname) && url.pathname.startsWith("/v1/notifications/certs/");
  } catch {
    return false;
  }
}
