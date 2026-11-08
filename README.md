# ClearSettle

ClearSettle is an AI revenue copilot for cross-border PayPal merchants. The first vertical slice turns a natural-language request into a reviewed invoice draft and creates that draft in PayPal Sandbox after explicit confirmation.

## What works now

- Natural-language invoice extraction using Gemini Structured Outputs.
- Editable multi-item invoices with quantity, unit-price, and total previews.
- A clearly labeled deterministic demo fallback when no AI key is configured.
- Editable review and confirmation before any PayPal action.
- Real PayPal Invoicing API v2 draft creation when sandbox credentials are configured.
- Separate confirmation to send a draft, with a sandbox buyer link.
- Live invoice status from verified PayPal webhook events.
- AI-generated collection reminders with merchant review before delivery.
- Personalized reminder email through Resend or a standard PayPal-native reminder.
- Durable reminder delivery history with idempotent email sends.
- PostgreSQL-backed idempotency claims before real PayPal writes.
- Verified, replay-resistant PayPal webhook ingestion with duplicate suppression.
- No floating-point arithmetic for invoice totals.

## Run locally

Requirements: Node.js 22+ and npm.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open <http://localhost:3000>.

The default configuration uses demo mode, so the complete interface works without credentials. Demo mode is visibly labeled and does not call PayPal or an AI model.

## Enable AI extraction

Set this in `.env.local`:

```env
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-3.5-flash-lite
```

The server uses schema-constrained output and validates the result again with Zod. The API key never reaches the browser.

## Enable personalized reminder email

Create a Resend API key, verify a sending domain, and add:

```env
RESEND_API_KEY=your_resend_key
REMINDER_FROM_EMAIL="ClearSettle <reminders@your-verified-domain.example>"
REMINDER_TEST_RECIPIENT=your_real_test_inbox@example.com
```

PayPal Sandbox buyer addresses use non-deliverable `example.com` domains, so `REMINDER_TEST_RECIPIENT` safely routes sandbox messages to a real inbox configured on the server. It is ignored in live mode. The buyer address otherwise comes from the stored PayPal invoice rather than the browser request. The server also retrieves the payer-view URL directly from PayPal before appending it to the approved reminder. Without the Resend variables, the standard PayPal reminder still works.

PayPal's v2 reminder endpoint uses PayPal's system-defined email content even when custom subject or note values are supplied, so the PayPal-native option intentionally does not pretend to send the AI copy. PayPal limits this option to two reminders per invoice per day.

## Enable PayPal Sandbox

In the PayPal Developer Dashboard, select Sandbox, create or select a REST application associated with your sandbox Business account, and add:

```env
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_secret
```

Real PayPal writes also require PostgreSQL so an interrupted request can be retried safely. Never commit `.env.local`.

## Set up PostgreSQL

Create a local database, then set its connection string:

```powershell
createdb -U postgres clearsettle
```

```env
DATABASE_URL=postgres://postgres:your_password@localhost:5432/clearsettle
```

Apply the checked-in migration:

```powershell
npm run db:migrate
```

The migrations create an invoice request ledger, an immutable PayPal webhook event log, and a reminder delivery audit log. A real PayPal invoice is not created unless this database is configured. Run this command again whenever a new migration is added.

## Register the PayPal webhook

Deploy the app to a public HTTPS URL, then add this listener to the same Sandbox REST app that owns the client credentials:

```text
https://your-domain.example/api/paypal/webhooks
```

Subscribe to the invoicing events you need, such as `INVOICING.INVOICE.PAID`, and copy the resulting webhook ID into `.env.local`:

```env
PAYPAL_WEBHOOK_ID=your_registered_webhook_id
```

The endpoint preserves the original request body, requires all PayPal signature headers, rejects stale transmissions, verifies the signature through PayPal, and stores each PayPal event ID once. The PayPal Webhooks Simulator cannot use postback verification; use a real Sandbox invoice event for the end-to-end test.

## Verify

```powershell
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
```

## Current boundary

This slice creates, sends, and tracks sandbox invoices through verified webhooks, then drafts and sends approved collection reminders. It does not schedule reminders autonomously, process webhook jobs asynchronously, or reconcile PayPal activity with bank settlements.

## License

[MIT](LICENSE)
