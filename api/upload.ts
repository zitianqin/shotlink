import type { Req, Res } from "./_http.js";
import { put } from "@vercel/blob";
import { isValidToken } from "./_tokens.js";

// POST /api/upload
//   Authorization: Bearer <shotlink token>   (sl_...)
//   Body (JSON): { filename?: string, contentType?: string, dataBase64: string }
// -> 200 { url } — a public, unguessable Vercel Blob URL.
//
// Guards: valid per-user token, image content types only, ~4MB max.

const MAX_BYTES = 4 * 1024 * 1024;

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const header = req.headers.authorization;
  const auth = Array.isArray(header) ? header[0] : header ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!(await isValidToken(token))) {
    return res
      .status(401)
      .json({ error: "unauthorized", detail: "missing or invalid shotlink token" });
  }

  const body = (req.body ?? {}) as {
    filename?: unknown;
    contentType?: unknown;
    dataBase64?: unknown;
  };

  if (typeof body.dataBase64 !== "string" || body.dataBase64.length === 0) {
    return res
      .status(400)
      .json({ error: "bad_request", detail: "dataBase64 (base64 string) is required" });
  }

  const contentType =
    typeof body.contentType === "string" && body.contentType ? body.contentType : undefined;
  if (contentType && !contentType.startsWith("image/")) {
    return res.status(415).json({ error: "unsupported_type", detail: "images only" });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(body.dataBase64, "base64");
  } catch {
    return res.status(400).json({ error: "bad_request", detail: "dataBase64 is not valid base64" });
  }
  if (buffer.length === 0) {
    return res.status(400).json({ error: "bad_request", detail: "decoded image is empty" });
  }
  if (buffer.length > MAX_BYTES) {
    return res
      .status(413)
      .json({ error: "too_large", detail: `image exceeds ${MAX_BYTES} bytes` });
  }

  const filename = sanitizeFilename(
    typeof body.filename === "string" ? body.filename : undefined,
  );

  try {
    const blob = await put(filename, buffer, {
      access: "public",
      addRandomSuffix: true, // unguessable capability URL
      contentType,
    });
    return res.status(200).json({ url: blob.url, pathname: blob.pathname });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: "blob_upload_failed", detail });
  }
}

// Keep only a safe basename; Blob's addRandomSuffix guarantees uniqueness anyway.
function sanitizeFilename(name: string | undefined): string {
  if (!name) return "image.png";
  const base = name.split(/[\\/]/).pop() ?? "image.png";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 128) : "image.png";
}
