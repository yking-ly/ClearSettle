"use client";

import { useEffect, useMemo, useState } from "react";

import { invoiceDraftSchema, invoiceTotal, type InvoiceDraft } from "@/lib/invoice";

type Stage = "describe" | "review" | "created";
type CreatedInvoice = {
  id: string;
  status: string;
  mode: "demo" | "paypal";
  href: string | null;
  payerViewUrl?: string | null;
};

const terminalStatuses = new Set(["PAID", "MARKED_AS_PAID", "CANCELLED", "REFUNDED", "MARKED_AS_REFUNDED"]);

const example = "Invoice Acme Corp $1,200 for October product design, due in 14 days. Send it to billing@acme.example.";

export function InvoiceCopilot() {
  const [prompt, setPrompt] = useState(example);
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [sourceMode, setSourceMode] = useState<"ai" | "demo" | null>(null);
  const [created, setCreated] = useState<CreatedInvoice | null>(null);
  const [invoiceRequestId, setInvoiceRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stage: Stage = created ? "created" : draft ? "review" : "describe";
  const total = useMemo(() => (draft ? invoiceTotal(draft) : "0.00"), [draft]);

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

  function reset() {
    setDraft(null);
    setCreated(null);
    setSourceMode(null);
    setInvoiceRequestId(null);
    setError(null);
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
              <Field label="Description" wide>
                <input value={draft.items[0].description} onChange={(e) => update("items", [{ ...draft.items[0], description: e.target.value }])} />
              </Field>
              <Field label="Amount">
                <div className="money-input"><span>{draft.currency}</span><input inputMode="decimal" value={draft.items[0].unit_amount} onChange={(e) => update("items", [{ ...draft.items[0], unit_amount: e.target.value }])} /></div>
              </Field>
              <Field label="Due date">
                <input type="date" value={draft.due_date ?? ""} onChange={(e) => update("due_date", e.target.value || null)} />
              </Field>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="review-actions">
              <button className="secondary" onClick={reset}>← Start over</button>
              <button className="primary" onClick={createInvoice} disabled={busy || !draft.customer_name || !draft.customer_email}>
                {busy ? "Creating…" : "Confirm & create draft"}<b>↗</b>
              </button>
            </div>
          </div>
          <aside className="total-card">
            <p>INVOICE PREVIEW</p>
            <div className="preview-customer"><span>Bill to</span><strong>{draft.customer_name || "Customer needed"}</strong><small>{draft.customer_email || "Email needed"}</small></div>
            <div className="preview-item"><span>{draft.items[0].description}</span><strong>{draft.currency} {total}</strong></div>
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
        </div>
      )}

      {error && stage === "describe" && <p className="error global-error" role="alert">{error}</p>}
    </section>
  );
}

function Step({ number, label, active, done }: { number: string; label: string; active: boolean; done: boolean }) {
  return <div className={`step ${active ? "active" : ""} ${done ? "done" : ""}`}><span>{done ? "✓" : number}</span><strong>{label}</strong></div>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "wide" : ""}><span>{label}</span>{children}</label>;
}
