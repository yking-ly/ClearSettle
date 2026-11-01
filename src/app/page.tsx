import { InvoiceCopilot } from "@/components/invoice-copilot";

export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ClearSettle home">
          <span className="brand-mark">C</span>
          <span>ClearSettle</span>
        </a>
        <div className="topbar-actions">
          <span className="environment"><i /> Sandbox workspace</span>
          <button className="avatar" aria-label="Open account menu">YN</button>
        </div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">PAYPAL REVENUE COPILOT</p>
          <h1>From finished work<br />to a clear payment.</h1>
          <p className="hero-copy">
            Describe what you delivered. ClearSettle drafts the invoice, checks what is missing,
            and prepares it for PayPal—without moving money until you confirm.
          </p>
        </div>
        <div className="promise-card">
          <span className="promise-icon">↗</span>
          <div>
            <small>PRODUCT PROMISE</small>
            <strong>Understand every step<br />between billed and banked.</strong>
          </div>
        </div>
      </section>

      <InvoiceCopilot />

      <footer>
        <span>Built for cross-border independents</span>
        <span>AI drafts. You decide. PayPal moves the money.</span>
      </footer>
    </main>
  );
}
