import { InvoiceCopilot } from "@/components/invoice-copilot";

export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ClearSettle home">
          <span className="brand-mark">C</span>
          <span>ClearSettle<small>Revenue copilot</small></span>
        </a>
        <div className="topbar-actions">
          <span className="environment"><i /> PayPal sandbox connected</span>
          <span className="avatar" aria-label="Workspace owner">YN</span>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-intro">
          <p className="eyebrow">PAYPAL REVENUE COPILOT</p>
          <h1>From finished work<br />to a clear payment.</h1>
          <p className="hero-copy">
            Describe what you delivered. ClearSettle drafts the invoice, checks what is missing,
            and prepares it for PayPal—without moving money until you confirm.
          </p>
          <div className="hero-proof" aria-label="How ClearSettle works">
            <div><span>01</span><strong>Describe</strong><small>Use plain language</small></div>
            <div><span>02</span><strong>Approve</strong><small>Stay in control</small></div>
            <div><span>03</span><strong>Collect</strong><small>Track every follow-up</small></div>
          </div>
        </div>
        <div className="promise-card">
          <div className="promise-topline">
            <span className="promise-icon">↗</span>
            <small>PRODUCT PROMISE</small>
          </div>
          <strong>Understand every step between billed and banked.</strong>
          <div className="promise-list">
            <span><i /> AI-assisted, never auto-sent</span>
            <span><i /> Verified PayPal status events</span>
            <span><i /> Human-approved follow-ups</span>
          </div>
        </div>
      </section>

      <InvoiceCopilot />

      <footer>
        <span><b>ClearSettle</b> · Built for cross-border independents</span>
        <span>AI drafts. You decide. PayPal moves the money.</span>
      </footer>
    </main>
  );
}
