import type { Req, Res } from "./_http.js";
import { issueToken } from "./_tokens.js";
import { readSession } from "./_auth.js";

// POST /api/token — mints a personal shotlink token + the `claude mcp add` line.
// Gated: requires a valid session cookie from GitHub org sign-in (/api/auth/login).

const REPO = "github:zitianqin/shotlink";

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const cookie = req.headers.cookie;
  const session = readSession(Array.isArray(cookie) ? cookie[0] : cookie, Date.now());
  if (!session) {
    return res.status(401).json({
      error: "unauthorized",
      detail: "sign in with GitHub first",
      loginUrl: "/api/auth/login",
    });
  }

  try {
    const label = `${session.login} (${session.org})`;
    const token = await issueToken(label, new Date().toISOString());
    const command = `claude mcp add shotlink -- npx -y ${REPO} --token=${token}`;
    return res.status(200).json({ token, command, login: session.login });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: "issue_failed", detail });
  }
}
