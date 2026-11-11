export function allowedAuthEmails(value = process.env.AUTH_ALLOWED_EMAILS) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowedAuthEmail(email: string | null | undefined, value?: string) {
  return Boolean(email && allowedAuthEmails(value).has(email.trim().toLowerCase()));
}

export function userInitials(name: string | null | undefined, email: string) {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length > 1) return `${words[0][0]}${words.at(-1)![0]}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}
