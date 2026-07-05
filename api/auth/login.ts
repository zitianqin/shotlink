import type { Req, Res } from "../_http.js";
import { makeState } from "../_auth.js";

// GET /api/auth/login — kick off GitHub OAuth (redirect to the authorize page).

export default function handler(req: Req, res: Res) {
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "");
  const redirectUri = `https://${host}/api/auth/callback`;
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope: "read:org",
    state: makeState(Date.now()),
    allow_signup: "false",
  });
  res.setHeader("Location", `https://github.com/login/oauth/authorize?${params.toString()}`);
  return res.status(302).end();
}
