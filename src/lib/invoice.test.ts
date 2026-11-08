import { describe, expect, it } from "vitest";

import { createDemoDraft, invoiceDraftSchema, invoiceTotal } from "./invoice";

describe("invoice helpers", () => {
  it("uses integer cents for invoice totals", () => {
    const draft = createDemoDraft("Invoice Acme Corp $10.25 at billing@example.com");
    draft.items[0].quantity = 3;
    expect(invoiceTotal(draft)).toBe("30.75");
  });

  it("totals multiple line items", () => {
    const draft = createDemoDraft("Invoice Acme Corp $10 at billing@example.com");
    draft.items.push({ description: "Workshop", quantity: 2, unit_amount: "25.50" });
    expect(invoiceTotal(draft)).toBe("61.00");
  });

  it("rejects zero-value line items", () => {
    const draft = createDemoDraft("Invoice Acme Corp $10 at billing@example.com");
    draft.items[0].unit_amount = "0.00";
    expect(invoiceDraftSchema.safeParse(draft).success).toBe(false);
  });

  it("creates a valid demo draft", () => {
    const draft = createDemoDraft("Invoice Acme Corp $1,200 at billing@example.com");
    expect(() => invoiceDraftSchema.parse(draft)).not.toThrow();
    expect(draft.items[0].unit_amount).toBe("1200");
  });
});
