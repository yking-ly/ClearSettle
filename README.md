# ClearSettle

ClearSettle is an AI revenue copilot for cross-border PayPal merchants. The first vertical slice turns a natural-language request into a reviewed invoice draft and creates that draft in PayPal Sandbox after explicit confirmation.

## What works now

- Natural-language invoice extraction using Gemini Structured Outputs.
- A clearly labeled deterministic demo fallback when no AI key is configured.
- Editable review and confirmation before any PayPal action.
- Real PayPal Invoicing API v2 draft creation when sandbox credentials are configured.
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

The migration creates an invoice request ledger and an immutable PayPal webhook event log. A real PayPal invoice is not created unless this database is configured.

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

This slice creates and persists draft invoices and ingests verified invoice webhooks. It still does not send invoices, move money, process webhook jobs asynchronously, or reconcile bank settlements.

## License

[MIT](LICENSE)
