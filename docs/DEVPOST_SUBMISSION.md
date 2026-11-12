# ClearSettle — Devpost submission

This file contains ready-to-paste submission copy. Replace only the bracketed items before submitting.

## Project name

ClearSettle

## Tagline

From finished work to a clear PayPal payment—with AI assistance and human approval at every step.

## Links

- Demo: https://clearsettle.vercel.app/
- Source: https://github.com/yking-ly/ClearSettle
- Demo video: `[ADD PUBLIC YOUTUBE URL]`

## Inspiration

Getting paid is often harder than completing the work. Independent merchants must turn informal project details into accurate invoices, monitor what happened after sending them, and write follow-ups that are firm without damaging a customer relationship. Cross-border work adds more uncertainty around payment status, timing, and fees.

We built ClearSettle to reduce that administrative burden without handing financial control to an AI agent. AI should prepare and explain; the merchant should approve; PayPal should move the money.

## What it does

ClearSettle lets a merchant describe completed work in everyday language. AI converts that description into a structured, multi-item invoice containing the customer, currency, amount, due date, and line items. The merchant reviews and edits every field before ClearSettle creates a draft through PayPal Invoicing API v2.

Sending the invoice is a separate confirmed action. The buyer can then pay it in PayPal Sandbox. ClearSettle verifies PayPal webhook signatures, stores each event once, and updates the displayed invoice status when payment occurs.

For an unpaid invoice, ClearSettle becomes a collections copilot. It uses the invoice context to draft a personalized reminder, explains the suggested tone, and lets the merchant edit the message. The merchant can send PayPal's standard reminder or approve personalized delivery through Resend. Delivery attempts are recorded in a durable audit history.

## How we built it

The application uses Next.js 16, React, and TypeScript on Vercel. Gemini Structured Outputs converts natural-language requests into a schema-constrained invoice and drafts contextual reminders. Zod validates model and request data at the server boundary.

PayPal Invoicing API v2 creates, sends, and reminds invoices. Local certificate and signature verification authenticates PayPal webhook events. Neon PostgreSQL stores idempotent invoice creation requests, immutable webhook events, and reminder delivery attempts. Neon Auth provides email/password sessions and a server-side merchant allowlist. Resend delivers approved custom reminders.

All external credentials remain server-side. Invoice creation, invoice sending, and reminder delivery are distinct merchant-approved actions.

## How PayPal is central

- PayPal creates the actual Sandbox invoice rather than acting as a superficial payment button.
- The buyer completes the invoice payment through PayPal Sandbox.
- Verified PayPal webhook events are the source of truth for invoice status.
- PayPal invoice IDs connect the application's creation, tracking, and collections workflow.
- PayPal's native reminder API provides a standard follow-up channel.

Without PayPal, the core create → send → pay → verify → follow-up loop would not exist.

## How AI is central

- Gemini transforms unstructured work descriptions into structured, editable multi-item invoices.
- Gemini drafts reminders using invoice context, due date, amount, and payment state.
- AI output is constrained by a schema, validated by the application, and presented for merchant review.
- AI never authorizes a payment, sends an invoice, or contacts a customer autonomously.

Without AI, merchants would still have to manually translate project language into billing data and compose each follow-up from scratch.

## Challenges we ran into

The most important challenge was building a reliable boundary between probabilistic AI output and financial APIs. We addressed it with structured model output, independent Zod validation, editable review screens, and explicit confirmation before every side effect.

PayPal webhook verification required preserving the original request, collecting all signature headers, rejecting stale transmissions, calculating the raw-body CRC32 value, and validating the RSA signature against PayPal's certificate before trusting an event. We also made invoice and reminder operations idempotent so retries do not create duplicate financial or communication actions.

Sandbox email addresses are intentionally non-deliverable, so personalized reminder testing required a server-side test-recipient override that is disabled outside Sandbox mode.

## Accomplishments that we're proud of

- Completed a real PayPal Sandbox lifecycle from AI-generated invoice through payment confirmation.
- Verified and persisted the `INVOICING.INVOICE.PAID` webhook event.
- Added editable multi-item invoices with currency values converted to integer minor units before totaling.
- Built an AI collections workflow that still requires human approval.
- Added two honest reminder channels: PayPal's standard content and separately approved personalized email.
- Implemented idempotency, webhook replay resistance, authentication, and durable audit history in a hackathon-sized product.

## What we learned

The most useful payment agent is not necessarily one that moves money autonomously. In a high-trust workflow, AI creates more value by translating intent, finding missing information, explaining state, and preparing the next action while leaving authorization with a person.

We also learned that webhook handling and idempotency are part of the product experience. A polished interface is not trustworthy if a retry can create two invoices or an unverified event can mark an invoice paid.

## What's next

- Isolate every record by merchant and support multiple workspaces.
- Add scheduled reminder policies with approval controls.
- Reconcile PayPal activity, fees, refunds, and bank settlements.
- Explain cross-border fees, foreign exchange, and expected arrival dates.
- Add cash-flow forecasting based on invoices, subscriptions, refunds, and disputes.
- Move webhook processing to a durable asynchronous queue.

## Tools and services used

- PayPal Developer Platform: Invoicing API v2, Sandbox, webhook verification, invoice reminders
- Google Gemini: structured invoice extraction and collection reminder drafting
- Neon: PostgreSQL and Auth
- Resend: personalized reminder delivery
- Next.js, React, TypeScript, Zod, and Drizzle ORM
- Vercel: deployment and server functions
- Vitest and ESLint: automated verification

## Functional demo access

The hosted application is available at https://clearsettle.vercel.app/. It uses PayPal Sandbox and does not move real money.

Before submission, add the final judge-access instruction here and to the Devpost form without publishing infrastructure secrets:

`[ADD JUDGE AUTHENTICATION OR REPOSITORY-RUN INSTRUCTION]`

Complete local setup and verification instructions are in the repository README.

## Final submission checklist

- [ ] Hosted deployment opens successfully in a private browser window.
- [ ] Judges have a documented way to access the authenticated application.
- [ ] Public repository contains all source code, migrations, `.env.example`, setup instructions, and the MIT license.
- [ ] No `.env.local`, API key, client secret, cookie secret, database URL, or test password is committed.
- [ ] PayPal Sandbox invoice creation, sending, buyer payment, and paid webhook status are re-tested on the final deployment.
- [ ] AI invoice extraction and personalized reminder delivery are re-tested on the final deployment.
- [ ] The Devpost tools section identifies PayPal, Gemini, Neon, Resend, Next.js, Vercel, and testing tools.
- [ ] Public YouTube demo video is under three minutes and linked in the submission.
- [ ] Video contains no unlicensed music or third-party copyrighted material.
- [ ] Bracketed placeholders in this document are replaced.
