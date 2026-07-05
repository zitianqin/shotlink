import { timingSafeEqual } from "node:crypto";
import type { Req, Res } from "./_http.js";
import { issueToken } from "./_tokens.js";

// POST /api/token   Body (JSON): { password: string, label?: string }
// -> 200 { token, command }. Gated by a shared access password (ACCESS_PASSWORD).

const REPO = "github:zitianqin/shotlink";

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const expected = process.env.ACCESS_PASSWORD;
  if (!expected) {
    return res
      .status(500)
      .json({ error: "server_misconfigured", detail: "ACCESS_PASSWORD is not set" });
  }

  const body = (req.body ?? {}) as { password?: unknown; label?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  if (!constantTimeEqual(password, expected)) {
    return res.status(401).json({ error: "unauthorized", detail: "wrong access password" });
  }

  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, 80)
      : undefined;

  try {
    const token = await issueToken(label, new Date().toISOString());
    const command = `claude mcp add shotlink -- npx -y ${REPO} --token=${token}`;
    return res.status(200).json({ token, command });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: "issue_failed", detail });
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
