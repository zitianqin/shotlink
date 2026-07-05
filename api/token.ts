import type { Req, Res } from "./_http.js";
import { issueToken } from "./_tokens.js";

// POST /api/token   Body (JSON, optional): { label?: string }
// -> 200 { token, command }  — mints a personal shotlink token and the exact
// `claude mcp add` line to paste. No auth in v1 (self-serve); a GitHub org gate
// is the planned fast-follow.

const REPO = "github:zitianqin/shotlink";

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const body = (req.body ?? {}) as { label?: unknown };
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
