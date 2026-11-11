import { describe, expect, it } from "vitest";

import { allowedAuthEmails, isAllowedAuthEmail, userInitials } from "./config";

describe("auth configuration", () => {
  it("normalizes a comma-separated email allowlist", () => {
    expect([...allowedAuthEmails(" Owner@Example.com, teammate@example.com, ")]).toEqual([
      "owner@example.com",
      "teammate@example.com",
    ]);
    expect(isAllowedAuthEmail("OWNER@example.com", "owner@example.com")).toBe(true);
    expect(isAllowedAuthEmail("stranger@example.com", "owner@example.com")).toBe(false);
  });

  it("fails closed when no allowlist is configured", () => {
    expect(isAllowedAuthEmail("owner@example.com", "")).toBe(false);
  });

  it("derives compact initials without exposing a fixed owner identity", () => {
    expect(userInitials("Yash Kotian", "yash@example.com")).toBe("YK");
    expect(userInitials("Yash", "yash@example.com")).toBe("YA");
    expect(userInitials(null, "owner@example.com")).toBe("OW");
  });
});
