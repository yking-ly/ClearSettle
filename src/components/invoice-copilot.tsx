"use client";

import { useEffect, useMemo, useState } from "react";

import { invoiceDraftSchema, invoiceTotal, type InvoiceDraft } from "@/lib/invoice";
import { isRemindableInvoiceStatus, reminderDraftSchema, type ReminderDraft } from "@/lib/reminder";

type Stage = "describe" | "review" | "created";
type CreatedInvoice = {
  id: string;
  status: string;
  mode: "demo" | "paypal";
  href: string | null;
  payerViewUrl?: string | null;
};
type ReminderAction = {
  id: string;
  delivery: "paypal" | "email";
  state: "SENDING" | "SENT" | "FAILED";
  subject: string | null;
  error: string | null;
  createdAt: string;
};

const terminalStatuses = new Set(["PAID", "MARKED_AS_PAID", "CANCELLED", "REFUNDED", "MARKED_AS_REFUNDED"]);

const example = "Invoice Acme Corp $1,200 for October product design, due in 14 days. Send it to billing@acme.example.";
const promptSuggestions = [
  "Website project · $2,400 · due in 14 days",
  "Monthly consulting · $850 · due on receipt",
  "Brand workshop · $1,250 · due next Friday",
];

export function InvoiceCopilot() {
  const [prompt, setPrompt] = useState(example);
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [sourceMode, setSourceMode] = useState<"ai" | "demo" | null>(null);
  const [created, setCreated] = useState<CreatedInvoice | null>(null);
  const [invoiceRequestId, setInvoiceRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminder, setReminder] = useState<ReminderDraft | null>(null);
  const [reminderMode, setReminderMode] = useState<"ai" | "demo" | null>(null);
  const [reminderBusy, setReminderBusy] = useState<"generate" | "email" | "paypal" | null>(null);
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);
  const [reminderActions, setReminderActions] = useState<ReminderAction[]>([]);

  const stage: Stage = created ? "created" : draft ? "review" : "describe";
  const total = useMemo(() => (draft ? invoiceTotal(draft) : "0.00"), [draft]);
  const draftIsValid = useMemo(
    () => Boolean(draft?.customer_name && draft.customer_email && invoiceDraftSchema.safeParse(draft).success),
    [draft],
  );

  useEffect(() => {
    if (
      !created ||
      created.mode !== "paypal" ||
      created.status === "DRAFT" ||
      terminalStatuses.has(created.status) ||
      !invoiceRequestId
    ) return;

    const refresh = async () => {
      const response = await fetch(`/api/paypal/invoices/${encodeURIComponent(created.id)}`, {
        headers: { "Invoice-Request-Id": invoiceRequestId },
        cache: "no-store",
      });
      if (!response.ok) return;
      const result = (await response.json()) as Pick<CreatedInvoice, "id" | "status" | "payerViewUrl">;
      setCreated((current) => current ? {
        ...current,
        status: result.status,
        payerViewUrl: result.payerViewUrl ?? current.payerViewUrl,
      } : current);
    };

    const timer = window.setInterval(refresh, 5_000);
    return () => window.clearInterval(timer);
  }, [created, invoiceRequestId]);

  useEffect(() => {
    if (!created || created.mode !== "paypal" || !invoiceRequestId || !isRemindableInvoiceStatus(created.status)) return;
    const controller = new AbortController();
    fetch(`/api/paypal/invoices/${encodeURIComponent(created.id)}/reminders`, {
      headers: { "Invoice-Request-Id": invoiceRequestId },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => response.ok ? response.json() as Promise<{ actions: ReminderAction[] }> : null)
      .then((result) => result && setReminderActions(result.actions))
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) console.error("Unable to load reminder history", caught);
      });
    return () => controller.abort();
  }, [created, invoiceRequestId]);

  async function request<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong");
    return data;
  }

  async function generateDraft() {
    setBusy(true);
    setError(null);
    try {
      const result = await request<{ draft: InvoiceDraft; mode: "ai" | "demo" }>("/api/ai/invoice-draft", { prompt });
      setDraft(invoiceDraftSchema.parse(result.draft));
      setInvoiceRequestId(crypto.randomUUID());
      setSourceMode(result.mode);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to draft the invoice");
    } finally {
      setBusy(false);
    }
  }

  function update<K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) {
    if (draft) {
      setDraft({ ...draft, [key]: value });
      setInvoiceRequestId(crypto.randomUUID());
    }
  }

  function updateItem(index: number, changes: Partial<InvoiceDraft["items"][number]>) {
    if (!draft) return;
    update("items", draft.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  }

  function addItem() {
    if (!draft || draft.items.length >= 20) return;
    update("items", [...draft.items, { description: "", quantity: 1, unit_amount: "" }]);
  }

  function removeItem(index: number) {
    if (!draft || draft.items.length === 1) return;
    update("items", draft.items.filter((_, itemIndex) => itemIndex !== index));
  }

  async function createInvoice() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const requestId = invoiceRequestId ?? crypto.randomUUID();
      setInvoiceRequestId(requestId);
      const result = await request<CreatedInvoice>("/api/paypal/invoices", draft, { "Idempotency-Key": requestId });
      setCreated(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create the PayPal invoice");
    } finally {
      setBusy(false);
    }
  }

  async function sendInvoice() {
    if (!created || !invoiceRequestId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await request<Pick<CreatedInvoice, "id" | "status" | "payerViewUrl">>(
        `/api/paypal/invoices/${encodeURIComponent(created.id)}`,
        {},
        { "Invoice-Request-Id": invoiceRequestId },
      );
      setCreated({ ...created, ...result });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send the PayPal invoice");
    } finally {
      setBusy(false);
    }
  }

  async function generateReminderDraft() {
    if (!created || !draft) return;
    setReminderBusy("generate");
    setReminderNotice(null);
    setError(null);
    try {
      const result = await request<{ reminder: ReminderDraft; mode: "ai" | "demo" }>("/api/ai/reminder-draft", {
        invoice_id: created.id,
        customer_name: draft.customer_name,
        currency: draft.currency,
        amount: invoiceTotal(draft),
        due_date: draft.due_date,
        status: created.status,
      });
      setReminder(reminderDraftSchema.parse(result.reminder));
      setReminderMode(result.mode);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to draft the reminder");
    } finally {
      setReminderBusy(null);
    }
  }

  async function sendReminder(delivery: "email" | "paypal") {
    if (!created || !invoiceRequestId || !reminder) return;
    setReminderBusy(delivery);
    setReminderNotice(null);
    setError(null);
    try {
      await request(
        `/api/paypal/invoices/${encodeURIComponent(created.id)}/reminders`,
        delivery === "email"
          ? { delivery, subject: reminder.subject, message: reminder.message }
          : { delivery },
        { "Invoice-Request-Id": invoiceRequestId, "Idempotency-Key": crypto.randomUUID() },
      );
      setReminderNotice(delivery === "email" ? "Personalized reminder email sent." : "Standard PayPal reminder sent.");
      const response = await fetch(`/api/paypal/invoices/${encodeURIComponent(created.id)}/reminders`, {
        headers: { "Invoice-Request-Id": invoiceRequestId },
        cache: "no-store",
      });
      if (response.ok) setReminderActions(((await response.json()) as { actions: ReminderAction[] }).actions);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send the reminder");
    } finally {
      setReminderBusy(null);
    }
  }

  function reset() {
    setDraft(null);
    setCreated(null);
    setSourceMode(null);
    setInvoiceRequestId(null);
    setError(null);
    setReminder(null);
    setReminderMode(null);
    setReminderBusy(null);
    setReminderNotice(null);
    setReminderActions([]);
  }

  return (
    <section className="workspace" aria-label="Invoice copilot">
      <nav className="steps" aria-label="Invoice progress">
        <Step number="01" label="Describe" active={stage === "describe"} done={stage !== "describe"} />
        <span className="step-line" />
        <Step number="02" label="Review" active={stage === "review"} done={stage === "created"} />
        <span className="step-line" />
        <Step number="03" label="Create" active={stage === "created"} done={false} />
      </nav>

      {stage === "describe" && (
        <div className="panel composer-panel">
          <div className="panel-heading">
            <div>
              <span className="section-number">01</span>
              <h2>What did you deliver?</h2>
            </div>
            <span className="safe-label">No invoice is sent without approval</span>
          </div>
          <label className="prompt-label" htmlFor="invoice-prompt">Describe the invoice in your own words</label>
          <div className="prompt-suggestions" aria-label="Example invoice prompts">
            <span>Try an example</span>
            {promptSuggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => setPrompt(`Create an invoice for ${suggestion}. Send it to client@example.com.`)}>
                {suggestion}
              </button>
            ))}
          </div>
          <textarea
            id="invoice-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={5}
            maxLength={2000}
          />
          <div className="composer-footer">
            <span>{prompt.length} / 2,000</span>
            <button className="primary" onClick={generateDraft} disabled={busy || prompt.trim().length < 10}>
              {busy ? "Drafting…" : "Create a draft"}<b>↗</b>
            </button>
          </div>
        </div>
      )}

      {stage === "review" && draft && (
        <div className="review-grid">
          <div className="panel">
            <div className="panel-heading">
              <div><span className="section-number">02</span><h2>Review the details</h2></div>
              <span className={`mode-label ${sourceMode}`}>{sourceMode === "ai" ? "AI extracted" : "Demo extracted"}</span>
            </div>
            <p className="summary">{draft.summary}</p>
            <div className="form-grid">
              <Field label="Customer name">
                <input value={draft.customer_name ?? ""} onChange={(e) => update("customer_name", e.target.value || null)} />
              </Field>
              <Field label="Customer email">
                <input type="email" value={draft.customer_email ?? ""} onChange={(e) => update("customer_email", e.target.value || null)} />
              </Field>
              <Field label="Due date">
                <input type="date" value={draft.due_date ?? ""} onChange={(e) => update("due_date", e.target.value || null)} />
              </Field>
            </div>
            <div className="line-items">
              <div className="line-items-heading">
                <h3>Line items</h3>
                <button className="secondary item-action" type="button" onClick={addItem} disabled={draft.items.length >= 20}>
                  + Add item
                </button>
              </div>
              {draft.items.map((item, index) => (
                <fieldset className="line-item" key={index}>
                  <legend>Item {String(index + 1).padStart(2, "0")}</legend>
                  <div className="form-grid line-item-grid">
                    <Field label="Description" wide>
                      <input
                        required
                        maxLength={200}
                        value={item.description}
                        onChange={(event) => updateItem(index, { description: event.target.value })}
                      />
                    </Field>
                    <Field label="Quantity">
                      <input
                        required
                        type="number"
                        min="0.01"
                        max="1000"
                        step="any"
                        value={item.quantity}
                        onChange={(event) => updateItem(index, { quantity: event.target.valueAsNumber || 0 })}
                      />
                    </Field>
                    <Field label="Unit amount">
                      <div className="money-input">
                        <span>{draft.currency}</span>
                        <input
                          required
                          type="number"
                          min="0.01"
                          step="0.01"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={item.unit_amount}
                          onChange={(event) => updateItem(index, { unit_amount: event.target.value })}
                        />
                      </div>
                    </Field>
                  </div>
                  {draft.items.length > 1 && (
                    <button
                      className="remove-item"
                      type="button"
                      onClick={() => removeItem(index)}
                      aria-label={`Remove item ${index + 1}`}
                    >
                      Remove item
                    </button>
                  )}
                </fieldset>
              ))}
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="review-actions">
              <button className="secondary" onClick={reset}>← Start over</button>
              <button className="primary" onClick={createInvoice} disabled={busy || !draftIsValid}>
                {busy ? "Creating…" : "Confirm & create draft"}<b>↗</b>
              </button>
            </div>
          </div>
          <aside className="total-card">
            <p>INVOICE PREVIEW</p>
            <div className="preview-customer"><span>Bill to</span><strong>{draft.customer_name || "Customer needed"}</strong><small>{draft.customer_email || "Email needed"}</small></div>
            <div className="preview-items">
              {draft.items.map((item, index) => (
                <div className="preview-item" key={index}>
                  <span>
                    {item.description || `Item ${index + 1}`}
                    <small>{item.quantity || 0} × {draft.currency} {item.unit_amount || "0.00"}</small>
                  </span>
                  <strong>{draft.currency} {invoiceTotal({ ...draft, items: [item] })}</strong>
                </div>
              ))}
            </div>
            <div className="preview-total"><span>Total</span><strong>{draft.currency} {total}</strong></div>
            <p className="estimate-note">Exact PayPal fees appear after payment. This draft does not estimate or promise net proceeds.</p>
          </aside>
        </div>
      )}

      {stage === "created" && created && (
        <div className="panel success-panel">
          <span className="success-mark">✓</span>
          <p className="eyebrow">{created.mode === "paypal" ? "PAYPAL SANDBOX" : "DEMO MODE"}</p>
          <h2>{created.status === "DRAFT" ? "Invoice draft created." : created.status === "PAID" ? "Invoice paid." : "Invoice sent."}</h2>
          <p>{created.status === "DRAFT"
            ? "Review the invoice ID, then explicitly send it when you are ready to notify the sandbox buyer."
            : "Status refreshes automatically from verified PayPal webhook events."}</p>
          <div className="status-strip" aria-label="Invoice delivery status">
            <div><span>Current status</span><strong>{created.status.replaceAll("_", " ")}</strong></div>
            <div><span>Payment rail</span><strong>{created.mode === "paypal" ? "PayPal sandbox" : "Demo"}</strong></div>
            <div><span>Status sync</span><strong>{created.mode === "paypal" ? "Webhook verified" : "Simulated"}</strong></div>
          </div>
          <div className="invoice-id"><span>Invoice ID</span><code>{created.id}</code><b>{created.status}</b></div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="success-actions">
            <button className="secondary" onClick={reset}>Create another invoice</button>
            {created.mode === "paypal" && created.status === "DRAFT" && (
              <button className="primary" onClick={sendInvoice} disabled={busy}>
                {busy ? "Sending…" : "Send to sandbox buyer"}<b>↗</b>
              </button>
            )}
            {created.payerViewUrl && (
              <a className="primary" href={created.payerViewUrl} target="_blank" rel="noreferrer">
                Open sandbox buyer view<b>↗</b>
              </a>
            )}
          </div>
          {created.mode === "paypal" && draft && invoiceRequestId && isRemindableInvoiceStatus(created.status) && (
            <section className="collections-card" aria-labelledby="collections-heading">
              <div className="collections-heading">
                <div>
                  <p className="eyebrow">COLLECTIONS ASSISTANT</p>
                  <h3 id="collections-heading">Follow up without losing the human touch.</h3>
                </div>
                {reminder && <span className={`tone-label ${reminder.tone}`}>{reminder.tone} tone</span>}
              </div>

              {!reminder ? (
                <button className="primary" type="button" onClick={generateReminderDraft} disabled={Boolean(reminderBusy)}>
                  {reminderBusy === "generate" ? "Drafting…" : "Generate AI reminder"}<b>↗</b>
                </button>
              ) : (
                <>
                  <p className="reminder-rationale"><strong>Why this tone:</strong> {reminder.rationale}</p>
                  <label className="reminder-field">
                    <span>Subject</span>
                    <input
                      maxLength={160}
                      value={reminder.subject}
                      onChange={(event) => setReminder({ ...reminder, subject: event.target.value })}
                    />
                  </label>
                  <label className="reminder-field">
                    <span>Message</span>
                    <textarea
                      maxLength={2_000}
                      value={reminder.message}
                      onChange={(event) => setReminder({ ...reminder, message: event.target.value })}
                    />
                  </label>
                  <div className="reminder-actions">
                    <button
                      className="primary"
                      type="button"
                      onClick={() => sendReminder("email")}
                      disabled={Boolean(reminderBusy) || !reminderDraftSchema.safeParse(reminder).success}
                    >
                      {reminderBusy === "email" ? "Sending…" : "Approve & send email"}<b>↗</b>
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => sendReminder("paypal")}
                      disabled={Boolean(reminderBusy)}
                    >
                      {reminderBusy === "paypal" ? "Sending…" : "Send standard PayPal reminder"}
                    </button>
                    <button className="text-action" type="button" onClick={generateReminderDraft} disabled={Boolean(reminderBusy)}>
                      Regenerate
                    </button>
                  </div>
                  <p className="delivery-note">
                    Personalized email uses the approved text and a verified PayPal payment link. PayPal reminders use PayPal&apos;s standard wording and are limited to two per invoice per day.
                  </p>
                </>
              )}

              {reminderNotice && <p className="notice" role="status">{reminderNotice}</p>}
              {reminderActions.length > 0 && (
                <div className="reminder-history">
                  <h4>Reminder history</h4>
                  {reminderActions.map((action) => (
                    <div className="reminder-history-row" key={action.id}>
                      <span>{action.delivery === "email" ? "Personalized email" : "PayPal reminder"}</span>
                      <time dateTime={action.createdAt}>{new Date(action.createdAt).toLocaleString()}</time>
                      <b className={action.state.toLowerCase()}>{action.state}</b>
                    </div>
                  ))}
                </div>
              )}
              {reminderMode === "demo" && <p className="delivery-note">Reminder copy is deterministic demo output because no AI key is configured.</p>}
            </section>
          )}
        </div>
      )}

      {error && stage === "describe" && <p className="error global-error" role="alert">{error}</p>}
    </section>
  );
}

function Step({ number, label, active, done }: { number: string; label: string; active: boolean; done: boolean }) {
  return <div className={`step ${active ? "active" : ""} ${done ? "done" : ""}`} aria-current={active ? "step" : undefined}><span>{done ? "✓" : number}</span><strong>{label}</strong></div>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "wide" : ""}><span>{label}</span>{children}</label>;
}
