import { describe, expect, it } from "vitest";

import { createDemoDraft, invoiceDraftSchema, invoiceTotal } from "./invoice";

describe("invoice helpers", () => {
  it("uses integer cents for invoice totals", () => {
    const draft = createDemoDraft("Invoice Acme Corp $10.25 at billing@example.com");
    draft.items[0].quantity = 3;
    expect(invoiceTotal(draft)).toBe("30.75");
  });

  it("creates a valid demo draft", () => {
    const draft = createDemoDraft("Invoice Acme Corp $1,200 at billing@example.com");
    expect(() => invoiceDraftSchema.parse(draft)).not.toThrow();
    expect(draft.items[0].unit_amount).toBe("1200");
  });
});
