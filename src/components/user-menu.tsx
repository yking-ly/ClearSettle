"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth/client";

export function UserMenu({ initials, name, email }: { initials: string; name: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <div className="user-menu">
      <button
        className="avatar"
        type="button"
        aria-label={`Open account menu for ${name}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {initials}
      </button>
      {open && (
        <div className="user-popover">
          <strong>{name}</strong>
          <span>{email}</span>
          <button type="button" onClick={signOut} disabled={busy}>
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
