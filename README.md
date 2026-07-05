# shotlink

Upload a local image, get a **public link that renders inline in a GitHub PR** —
no browser, nothing committed to the repo. Hosted on Vercel; teammates set it up
with one command and zero config.

- **Landing page** (`public/index.html`) — self-serve: click *Generate* to mint a
  personal token and get the exact `claude mcp add` line.
- **`api/token.ts`** — issues per-user tokens (stored as tiny blobs; revocable).
- **`api/upload.ts`** — validates the token, stores the image in Vercel Blob
  (`access: 'public'`, random suffix → unguessable URL), returns the URL.
- **`src/index.ts` → `dist/index.js`** — the local MCP server exposing
  `upload_image(path)`. Runs locally (via `npx`) so it can read local files.

```
teammate: claude mcp add shotlink -- npx -y github:zitianqin/shotlink --token=sl_…
                                          │ runs locally (stdio)
             upload_image(path) ──POST /api/upload (Bearer sl_…)──►  Vercel fn
                                                                       │ put(access:public)
   https://<hash>.public.blob.vercel-storage.com/…  ◄── url ───────────┘  Vercel Blob (CDN)
```

## For teammates (zero setup)

1. Go to **https://shotlink.vercel.app**, click **Generate**, copy the command.
2. Paste it into your terminal (it's `claude mcp add shotlink -- npx -y …`).
3. Restart Claude Code. Now ask it to add a screenshot to a PR, or call
   `upload_image(path="/abs/path/shot.png")` directly.

No clone, no build, no env vars, no Vercel account. `npx` runs the MCP client
locally (needed to read your local screenshots); everything else is hosted.

## Security model

Uploaded GET URLs are **capability URLs** — public but unguessable (random suffix),
the same posture GitHub's own `user-attachments` uses. You can't have "renders
inline in a PR" *and* "auth-gated", because GitHub's camo proxy fetches
anonymously. Anyone with a link can view that image; nobody can guess it. Fine for
UI screenshots; treat links to PII-bearing images as sensitive. Uploads are
image-only and capped at 4 MB. Tokens are personal and revocable.

> **v1 note:** token issuance is open (self-serve, unlisted URL). A GitHub org
> login gate on the *Generate* button is the planned fast-follow.

## Operating it (host only)

The service is already deployed. Admin tasks:

- **Rotate/revoke a token:** delete its record blob.
  ```bash
  # token records live at tokens/<sha256(token)>.json in the Blob store
  vercel blob del "tokens/<hash>.json"
  ```
- **Redeploy:** `vercel --prod` (or push to `main`, which auto-deploys).
- **Env:** `BLOB_READ_WRITE_TOKEN` is injected by the linked Blob store. No
  `UPLOAD_TOKEN` anymore — auth is per-user tokens from `/api/token`.

## Developing

```bash
npm install                 # runtime deps only
npm run build               # compiles src → dist (uses npx typescript)
```

`dist/` is committed on purpose so `npx github:zitianqin/shotlink` needs no build
step. Rebuild and commit `dist/` whenever you change `src/`.

## Limits

- **Request size:** Vercel caps function bodies at ~4.5 MB; base64 adds ~33%, so
  source images up to ~3 MB upload fine (enforced hard at 4 MB decoded).
- **Types:** png/jpg/gif/webp/svg/avif/bmp get the right content-type by extension.
- **Blobs live forever** — no expiry configured.
