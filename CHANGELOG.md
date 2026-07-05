# Changelog

## 0.2.0

- **Renamed** `image-self-host-mcp` → **shotlink**; hosted SaaS rather than
  self-hosted.
- **Self-serve, GitHub-org-gated tokens.** Members of the `Edexia` org sign in
  with GitHub on the landing page and get a personal `claude mcp add` command.
  Tokens are revocable and labelled by GitHub login.
- **Zero-setup install** for teammates: `npx github:zitianqin/shotlink` — no
  clone, build, env, or Vercel account. `dist/` is committed for this.
- **50 MB uploads** via Vercel Blob client uploads (direct-to-Blob), bypassing
  the ~4.5 MB function-body limit; multipart for files over 8 MB.
- Image-only, unguessable capability URLs that render inline in GitHub PRs.

## 0.1.0

- Initial Vercel-hosted image upload function + MCP `upload_image` tool.
