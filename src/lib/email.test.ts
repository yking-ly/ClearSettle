import { afterEach, describe, expect, it } from "vitest";

import { reminderEmailText, reminderRecipient } from "./email";

const originalPayPalEnvironment = process.env.PAYPAL_ENV;
const originalTestRecipient = process.env.REMINDER_TEST_RECIPIENT;

describe("reminder email", () => {
  afterEach(() => {
    if (originalPayPalEnvironment === undefined) delete process.env.PAYPAL_ENV;
    else process.env.PAYPAL_ENV = originalPayPalEnvironment;
    if (originalTestRecipient === undefined) delete process.env.REMINDER_TEST_RECIPIENT;
    else process.env.REMINDER_TEST_RECIPIENT = originalTestRecipient;
  });

  it("appends the server-verified PayPal payment link", () => {
    expect(reminderEmailText("Please pay.  ", "https://sandbox.paypal.com/invoice/payerView/details/INV2-TEST")).toBe(
      "Please pay.\n\nPay securely with PayPal:\nhttps://sandbox.paypal.com/invoice/payerView/details/INV2-TEST",
    );
  });

  it("routes sandbox reminders to a configured real test inbox", () => {
    process.env.PAYPAL_ENV = "sandbox";
    process.env.REMINDER_TEST_RECIPIENT = "merchant@example.test";
    expect(reminderRecipient("buyer@personal.example.com")).toBe("merchant@example.test");

    process.env.PAYPAL_ENV = "live";
    expect(reminderRecipient("buyer@example.com")).toBe("buyer@example.com");
  });
});
