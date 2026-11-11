import { AuthForm } from "@/components/auth-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="auth-shell">
      <a className="brand auth-brand" href="/sign-in" aria-label="ClearSettle sign in">
        <span className="brand-mark">C</span>
        <span>ClearSettle<small>Revenue copilot</small></span>
      </a>
      <section className="auth-card">
        <p className="eyebrow">SECURE MERCHANT WORKSPACE</p>
        <h1>Welcome back.</h1>
        <p>Sign in to draft invoices, manage reminders, and view PayPal payment status.</p>
        <AuthForm unauthorized={error === "unauthorized"} />
      </section>
      <p className="auth-footnote">Authentication by Neon · Payments by PayPal</p>
    </main>
  );
}
