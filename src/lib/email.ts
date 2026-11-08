type ReminderEmail = {
  to: string;
  subject: string;
  message: string;
  paymentUrl: string;
  idempotencyKey: string;
};

export function reminderEmailText(message: string, paymentUrl: string) {
  return `${message.trim()}\n\nPay securely with PayPal:\n${paymentUrl}`;
}

export function reminderRecipient(invoiceEmail: string) {
  return process.env.PAYPAL_ENV === "live"
    ? invoiceEmail
    : process.env.REMINDER_TEST_RECIPIENT?.trim() || invoiceEmail;
}

export async function sendReminderEmail(email: ReminderEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Personalized email is not configured");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": email.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      text: reminderEmailText(email.message, email.paymentUrl),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  const data = await response.json() as { id?: string; message?: string };
  if (!response.ok || !data.id) throw new Error(data.message || `Email delivery failed (${response.status})`);
  return data.id;
}
