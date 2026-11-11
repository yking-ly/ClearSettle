import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";
import { NextResponse } from "next/server";

import { isAllowedAuthEmail } from "./config";

let auth: NeonAuth | undefined;

function getAuth() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !secret) throw new AuthConfigurationError();

  auth ??= createNeonAuth({
    baseUrl,
    cookies: { secret },
    logLevel: "warn",
  });
  return auth;
}

export function authHandler() {
  return getAuth().handler();
}

export async function currentAuthorizedUser() {
  const { data, error } = await getAuth().getSession();
  if (error) throw new Error(error.message);
  if (!data?.user || !isAllowedAuthEmail(data.user.email)) return null;
  return data.user;
}

export async function apiAuthFailure() {
  try {
    const { data, error } = await getAuth().getSession();
    if (error || !data?.user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!isAllowedAuthEmail(data.user.email)) {
      return NextResponse.json({ error: "This account is not authorized for this workspace" }, { status: 403 });
    }
    return null;
  } catch (error) {
    console.error("Authentication check failed", error);
    return NextResponse.json({ error: "Authentication is not configured" }, { status: 503 });
  }
}

export class AuthConfigurationError extends Error {
  constructor() {
    super("NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET are required");
  }
}
