import { createSign, generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  invoiceIdFromHref,
  isFreshPayPalTransmission,
  paypalErrorMessage,
  paypalInvoicePayerViewUrl,
  paypalPaymentTerm,
  paypalWebhookVerificationMessage,
  readPayPalWebhookHeaders,
  verifyPayPalSignature,
} from "./paypal";

describe("PayPal invoice response parsing", () => {
  it("prefers PayPal's actionable validation detail", () => {
    expect(paypalErrorMessage({
      message: "Request failed",
      details: [{ description: "Use an international sandbox customer." }],
    }, "Fallback")).toBe("Use an international sandbox customer.");
  });

  it("uses PayPal's accepted payment terms", () => {
    expect(paypalPaymentTerm("2026-11-15")).toEqual({
      term_type: "DUE_ON_DATE_SPECIFIED",
      due_date: "2026-11-15",
    });
    expect(paypalPaymentTerm(null)).toEqual({ term_type: "DUE_ON_RECEIPT" });
  });

  it("extracts a v2 invoice ID from PayPal's create response href", () => {
    expect(
      invoiceIdFromHref("https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-ABCD-EFGH-IJKL-MNOP"),
    ).toBe("INV2-ABCD-EFGH-IJKL-MNOP");
  });

  it("returns null when the response does not identify an invoice", () => {
    expect(invoiceIdFromHref("https://api-m.sandbox.paypal.com/v2/invoicing/invoices")).toBeNull();
  });

  it("reads the recipient payment URL from current invoice metadata", () => {
    expect(paypalInvoicePayerViewUrl({
      detail: { metadata: { recipient_view_url: "https://www.sandbox.paypal.com/invoice/payerView/details/INV2-TEST" } },
    })).toBe("https://www.sandbox.paypal.com/invoice/payerView/details/INV2-TEST");
  });

  it("keeps supporting the legacy payer-view link", () => {
    expect(paypalInvoicePayerViewUrl({
      links: [{ rel: "payer-view", href: "https://www.sandbox.paypal.com/invoice/payerView/details/INV2-OLD" }],
    })).toBe("https://www.sandbox.paypal.com/invoice/payerView/details/INV2-OLD");
  });
});

describe("PayPal webhook validation", () => {
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

  it("builds PayPal's raw-body CRC32 verification message", () => {
    const headers = readPayPalWebhookHeaders(
      new Headers({
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-123",
        "paypal-transmission-id": "transmission-1",
        "paypal-transmission-sig": "signature",
        "paypal-transmission-time": "2026-11-01T09:00:00.000Z",
      }),
    );

    expect(paypalWebhookVerificationMessage("123456789", headers, "WH-ID")).toBe(
      "transmission-1|2026-11-01T09:00:00.000Z|WH-ID|3421780262",
    );
  });

  it("verifies an RSA-SHA256 signature", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const message = "transmission|time|webhook|crc";
    const signer = createSign("SHA256");
    signer.update(message);
    signer.end();
    const signature = signer.sign(privateKey).toString("base64");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

    expect(verifyPayPalSignature(message, signature, publicKeyPem)).toBe(true);
    expect(verifyPayPalSignature(`${message}-changed`, signature, publicKeyPem)).toBe(false);
  });

  it("rejects stale or malformed transmission times", () => {
    const now = Date.parse("2026-11-01T09:04:00.000Z");
    expect(isFreshPayPalTransmission("2026-11-01T09:00:00.000Z", now)).toBe(true);
    expect(isFreshPayPalTransmission("2026-11-01T08:58:59.000Z", now)).toBe(false);
    expect(isFreshPayPalTransmission("not-a-date", now)).toBe(false);
  });
});
