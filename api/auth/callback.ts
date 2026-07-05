import type { Req, Res } from "../_http.js";
import { checkState, exchangeCode, orgMemberLogin, makeSession, sessionCookie } from "../_auth.js";

// GET /api/auth/callback?code&state — finish GitHub OAuth. If the user is an
// active member of ALLOWED_GITHUB_ORG, set a signed session cookie and bounce
// back to the page; otherwise redirect with an error.

export default async function handler(req: Req, res: Res) {
  const now = Date.now();
  const url = new URL(req.url ?? "", "http://localhost");
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";

  const redirect = (to: string) => {
    res.setHeader("Location", to);
    return res.status(302).end();
  };

  if (!code || !checkState(state, now)) return redirect("/?error=bad_request");

  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "");
  const redirectUri = `https://${host}/api/auth/callback`;

  try {
    const accessToken = await exchangeCode(code, redirectUri);
    const org = process.env.ALLOWED_GITHUB_ORG ?? "";
    const login = await orgMemberLogin(accessToken, org);
    if (!login) return redirect("/?error=not_member");

    res.setHeader("Set-Cookie", sessionCookie(makeSession(login, org, now)));
    return redirect("/?authed=1");
  } catch {
    return redirect("/?error=auth_failed");
  }
}
