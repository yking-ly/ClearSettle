import { describe, expect, it } from "vitest";

import {
  buildWebhookVerificationPayload,
  invoiceIdFromHref,
  isFreshPayPalTransmission,
  paypalWebhookEventSchema,
  readPayPalWebhookHeaders,
} from "./paypal";

describe("PayPal invoice response parsing", () => {
  it("extracts a v2 invoice ID from PayPal's create response href", () => {
    expect(
      invoiceIdFromHref("https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-ABCD-EFGH-IJKL-MNOP"),
    ).toBe("INV2-ABCD-EFGH-IJKL-MNOP");
  });

  it("returns null when the response does not identify an invoice", () => {
    expect(invoiceIdFromHref("https://api-m.sandbox.paypal.com/v2/invoicing/invoices")).toBeNull();
  });
});

describe("PayPal webhook validation", () => {
  const event = paypalWebhookEventSchema.parse({
    id: "WH-123",
    event_type: "INVOICING.INVOICE.PAID",
    create_time: "2026-11-01T09:00:00.000Z",
    resource_type: "invoice",
    resource: { id: "INV2-123", status: "PAID" },
  });

  it("requires every signature header and a PayPal certificate URL", () => {
    expect(() => readPayPalWebhookHeaders(new Headers())).toThrow("Missing required PayPal signature headers");

    expect(() =>
      readPayPalWebhookHeaders(
        new Headers({
          "paypal-auth-algo": "SHA256withRSA",
          "paypal-cert-url": "https://attacker.example/cert.pem",
          "paypal-transmission-id": "transmission-1",
          "paypal-transmission-sig": "signature",
          "paypal-transmission-time": "2026-11-01T09:00:00.000Z",
        }),
      ),
    ).toThrow("Invalid PayPal certificate URL");
  });

  it("builds the exact postback verification contract", () => {
    const headers = readPayPalWebhookHeaders(
      new Headers({
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-123",
        "paypal-transmission-id": "transmission-1",
        "paypal-transmission-sig": "signature",
        "paypal-transmission-time": "2026-11-01T09:00:00.000Z",
      }),
    );

    expect(buildWebhookVerificationPayload(event, headers, "WH-ID")).toEqual({
      auth_algo: "SHA256withRSA",
      cert_url: "https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-123",
      transmission_id: "transmission-1",
      transmission_sig: "signature",
      transmission_time: "2026-11-01T09:00:00.000Z",
      webhook_id: "WH-ID",
      webhook_event: event,
    });
  });

  it("rejects stale or malformed transmission times", () => {
    const now = Date.parse("2026-11-01T09:04:00.000Z");
    expect(isFreshPayPalTransmission("2026-11-01T09:00:00.000Z", now)).toBe(true);
    expect(isFreshPayPalTransmission("2026-11-01T08:58:59.000Z", now)).toBe(false);
    expect(isFreshPayPalTransmission("not-a-date", now)).toBe(false);
  });
});
