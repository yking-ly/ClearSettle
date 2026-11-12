"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth/client";

export function AuthForm({ unauthorized = false }: { unauthorized?: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(unauthorized ? "This account is not authorized for this workspace." : "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const form = new FormData(event.currentTarget);
      const email = String(form.get("email") ?? "");
      const password = String(form.get("password") ?? "");
      const result = creating
        ? await authClient.signUp.email({ email, password, name: String(form.get("name") ?? "") })
        : await authClient.signIn.email({ email, password });

      if (result.error) {
        setError(result.error.message || "Unable to authenticate");
        return;
      }
      router.push("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication is temporarily unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {creating && (
        <label>
          <span>Name</span>
          <input name="name" autoComplete="name" required maxLength={80} />
        </label>
      )}
      <label>
        <span>Email</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        <span>Password</span>
        <input
          name="password"
          type="password"
          autoComplete={creating ? "new-password" : "current-password"}
          minLength={8}
          required
        />
      </label>
      {error && <p className="error auth-error" role="alert">{error}</p>}
      <button className="primary auth-submit" type="submit" disabled={busy}>
        {busy ? "Please wait…" : creating ? "Create account" : "Sign in"}<b>↗</b>
      </button>
      <button
        className="auth-switch"
        type="button"
        onClick={() => { setCreating((value) => !value); setError(""); }}
      >
        {creating ? "Already have an account? Sign in" : "First time here? Create an account"}
      </button>
    </form>
  );
}
