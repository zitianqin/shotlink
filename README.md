# image-self-host-mcp

Upload a local image and get back a **public, unguessable URL** — no browser, no
file committed to your repo. Built to embed screenshots in GitHub PR
descriptions/comments (the URL renders inline, even on private repos, because
GitHub's image proxy can fetch it).

Two pieces, one repo:

- **`api/upload.ts`** — a thin Vercel function. Authenticates the caller with a
  narrow bearer token, stores the bytes in **Vercel Blob** (`access: 'public'`,
  random suffix → capability URL), and returns the URL. The powerful
  `BLOB_READ_WRITE_TOKEN` never leaves the server.
- **`src/index.ts`** — a local MCP server exposing one tool, `upload_image(path)`,
  which reads a file and POSTs it to the function.

```
upload_image(path)  ──POST /api/upload (Bearer UPLOAD_TOKEN)──►  Vercel fn
                                                                    │ put(access:public)
   https://<hash>.public.blob.vercel-storage.com/...  ◄── url ──────┘  Vercel Blob (CDN)
```

## Security model

The GET URL is a **capability URL**: public but unguessable (random suffix). This
is the same posture GitHub's own `user-attachments` uses on private repos — you
cannot have "renders inline in a PR" *and* "auth-gated", because GitHub's camo
proxy fetches anonymously. Anyone with the link can view the image; nobody can
guess it. Blobs live forever until you delete them. Don't paste URLs for images
you couldn't tolerate leaking.

## Deploy the function (one time)

1. **Install & log in**

   ```bash
   npm install
   npm i -g vercel        # if you don't have it
   vercel login
   ```

2. **Link the project**

   ```bash
   vercel link
   ```

3. **Create a Blob store and attach it** (injects `BLOB_READ_WRITE_TOKEN`):

   Dashboard → your project → **Storage** → **Create** → **Blob** → connect it to
   the project. (Or `vercel blob store add`.)

4. **Set the upload token** the callers will present:

   ```bash
   openssl rand -hex 32                      # copy the output
   vercel env add UPLOAD_TOKEN               # paste it, choose all environments
   ```

5. **Deploy**

   ```bash
   vercel --prod
   ```

   Note the deployment URL; your endpoint is `https://<app>.vercel.app/api/upload`.

### Quick check

```bash
# should be 401 (no token)
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<app>.vercel.app/api/upload

# should return {"url":"https://...public.blob.vercel-storage.com/..."}
B64=$(base64 -i some.png)
curl -s -X POST https://<app>.vercel.app/api/upload \
  -H "Authorization: Bearer $UPLOAD_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"filename\":\"some.png\",\"contentType\":\"image/png\",\"dataBase64\":\"$B64\"}"
```

## Wire up the MCP server (local)

Build it:

```bash
npm install && npm run build
```

Register it with Claude Code (adjust the path):

```json
{
  "mcpServers": {
    "image-host": {
      "command": "node",
      "args": ["/Users/you/Dev/image-self-host-mcp/dist/index.js"],
      "env": {
        "IMAGE_HOST_ENDPOINT": "https://your-app.vercel.app/api/upload",
        "IMAGE_HOST_TOKEN": "the-same-value-as-UPLOAD_TOKEN"
      }
    }
  }
}
```

Then the `upload_image` tool takes a local `path` and returns the public URL, e.g.:

```bash
gh pr edit 123 --body "$(printf '## Screenshot\n\n![screenshot](%s)' "$URL")"
```

## Notes / limits

- **Request size:** Vercel caps function request bodies at ~4.5 MB. Base64 adds
  ~33%, so source images up to ~3 MB upload fine — plenty for screenshots.
- **Supported types:** the MCP client sets a content-type for png/jpg/gif/webp/
  svg/avif/bmp by extension; anything else uploads without an explicit type.
- **No expiry (v1):** blobs live forever. To add TTL later, store `pathname`s and
  run a Vercel Cron that calls `del()` on old ones.
