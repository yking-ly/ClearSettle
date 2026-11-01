import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createInteraction } = vi.hoisted(() => ({ createInteraction: vi.fn() }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    interactions = { create: createInteraction };
  },
}));

import { extractInvoice } from "./invoice-extractor";

const draft = {
  is_invoice_request: true,
  customer_name: "Acme Ltd",
  customer_email: "billing@acme.example",
  currency: "USD",
  items: [{ description: "Product design", quantity: 1, unit_amount: "1250.00" }],
  due_date: "2026-11-15",
  note: null,
  missing_fields: [],
  summary: "Invoice draft for Acme Ltd.",
};

describe("extractInvoice", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
    vi.stubEnv("DEMO_MODE", "false");
    createInteraction.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("extracts and validates a schema-constrained Gemini response", async () => {
    createInteraction.mockResolvedValue({ output_text: JSON.stringify(draft) });

    await expect(extractInvoice("Invoice Acme Ltd for product design")).resolves.toEqual({
      draft,
      mode: "ai",
    });

    expect(createInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-3.5-flash-lite",
        input: "Invoice Acme Ltd for product design",
        response_format: expect.objectContaining({ mime_type: "application/json" }),
        store: false,
      }),
      { timeout: 30_000 },
    );
  });

  it("uses the labeled demo fallback when no key is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("DEMO_MODE", "true");

    const result = await extractInvoice("Invoice Acme Ltd at billing@acme.example for USD 1250");

    expect(result.mode).toBe("demo");
    expect(createInteraction).not.toHaveBeenCalled();
  });
});
