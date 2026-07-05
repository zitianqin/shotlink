import { createHmac, timingSafeEqual } from "node:crypto";

// GitHub OAuth + signed-cookie session helpers for gating token issuance to
// members of a specific GitHub org. Stateless: sessions and OAuth state are
// HMAC-signed with SESSION_SECRET, so there's nothing to store.

export const SESSION_COOKIE = "shotlink_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

// ── generic signed tokens: base64url(payloadJSON).hmac ──────────────────────

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function sign(payload: object): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const mac = b64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${mac}`;
}

export function verify<T>(token: string | undefined): T | null {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expected = b64url(createHmac("sha256", secret()).update(body).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(fromB64url(body).toString()) as T;
  } catch {
    return null;
  }
}

// ── session ─────────────────────────────────────────────────────────────────

export interface Session {
  login: string;
  org: string;
  exp: number;
}

export function makeSession(login: string, org: string, now: number): string {
  return sign({ login, org, exp: now + SESSION_TTL_MS } satisfies Session);
}

export function readSession(cookieHeader: string | undefined, now: number): Session | null {
  const raw = parseCookies(cookieHeader)[SESSION_COOKIE];
  const s = verify<Session>(raw);
  if (!s || typeof s.exp !== "number" || s.exp < now) return null;
  return s;
}

export function sessionCookie(value: string): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

// ── OAuth state (CSRF) ───────────────────────────────────────────────────────

export function makeState(now: number): string {
  return sign({ n: b64url(createHmac("sha256", secret()).update(String(now)).digest()).slice(0, 16), exp: now + 10 * 60 * 1000 });
}

export function checkState(state: string | undefined, now: number): boolean {
  const s = verify<{ exp: number }>(state);
  return !!s && typeof s.exp === "number" && s.exp >= now;
}

// ── cookies ──────────────────────────────────────────────────────────────────

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// ── GitHub API ───────────────────────────────────────────────────────────────

export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(data.error || "no access_token from GitHub");
  return data.access_token;
}

// Returns the user's login if they are an active member of `org`, else null.
export async function orgMemberLogin(accessToken: string, org: string): Promise<string | null> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "shotlink",
  };
  const me = await fetch("https://api.github.com/user", { headers });
  if (!me.ok) return null;
  const login = ((await me.json()) as { login?: string }).login;
  if (!login) return null;

  const m = await fetch(
    `https://api.github.com/user/memberships/orgs/${encodeURIComponent(org)}`,
    { headers },
  );
  if (!m.ok) return null;
  const membership = (await m.json()) as { state?: string };
  return membership.state === "active" ? login : null;
}
