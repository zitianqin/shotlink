import type { VercelRequest, VercelResponse } from "@vercel/node";
import { put } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";

// POST /api/upload
//   Authorization: Bearer <UPLOAD_TOKEN>
//   Body (JSON): { filename?: string, contentType?: string, dataBase64: string }
// -> 200 { url } where url is a public, unguessable Vercel Blob URL.
//
// The powerful BLOB_READ_WRITE_TOKEN never leaves the server; callers only ever
// hold the narrow UPLOAD_TOKEN, which can do nothing but hit this endpoint.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const expected = process.env.UPLOAD_TOKEN;
  if (!expected) {
    return res
      .status(500)
      .json({ error: "server_misconfigured", detail: "UPLOAD_TOKEN is not set" });
  }

  const header = req.headers.authorization ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!constantTimeEqual(provided, expected)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  // @vercel/node parses JSON bodies automatically.
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

  let buffer: Buffer;
  try {
    buffer = Buffer.from(body.dataBase64, "base64");
  } catch {
    return res.status(400).json({ error: "bad_request", detail: "dataBase64 is not valid base64" });
  }
  if (buffer.length === 0) {
    return res.status(400).json({ error: "bad_request", detail: "decoded image is empty" });
  }

  const filename = sanitizeFilename(
    typeof body.filename === "string" ? body.filename : undefined,
  );
  const contentType =
    typeof body.contentType === "string" && body.contentType ? body.contentType : undefined;

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

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Keep only a safe basename; Blob's addRandomSuffix guarantees uniqueness anyway.
function sanitizeFilename(name: string | undefined): string {
  if (!name) return "image.png";
  const base = name.split(/[\\/]/).pop() ?? "image.png";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 128) : "image.png";
}
