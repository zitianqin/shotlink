import type { IncomingMessage } from "node:http";
import type { Res } from "./_http.js";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isValidToken } from "./_tokens.js";

// POST /api/upload — Vercel Blob *client upload* handler.
//
// The file is uploaded directly from the MCP client to Blob storage, NOT through
// this function, so it isn't bound by Vercel's ~4.5MB function-body limit. This
// endpoint only (a) authorizes the upload (validates the shotlink token carried in
// clientPayload) and mints a scoped client token, and (b) receives the
// upload-completed callback. Guards: image-only, 50MB max.

type Req = IncomingMessage & { body?: unknown };

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
  "image/bmp",
];

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const jsonResponse = await handleUpload({
      body: req.body as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        let token = "";
        let size = 0;
        try {
          const p = JSON.parse(clientPayload ?? "{}") as { token?: string; size?: number };
          token = p.token ?? "";
          size = typeof p.size === "number" ? p.size : 0;
        } catch {
          /* falls through to unauthorized */
        }
        if (!(await isValidToken(token))) {
          throw new UnauthorizedError();
        }
        // maximumSizeInBytes is only enforced for single-request uploads, not
        // multipart — so we also gate on the client-declared size here.
        if (size > MAX_BYTES) {
          throw new TooLargeError();
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true, // unguessable capability URL
        };
      },
      // Fired server-to-server by Blob after the upload finishes. Nothing to do.
      onUploadCompleted: async () => {},
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return res
        .status(401)
        .json({ error: "unauthorized", detail: "missing or invalid shotlink token" });
    }
    if (err instanceof TooLargeError) {
      return res
        .status(413)
        .json({ error: "too_large", detail: `image exceeds ${MAX_BYTES} bytes (50MB)` });
    }
    const detail = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ error: "upload_failed", detail });
  }
}

class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

class TooLargeError extends Error {
  constructor() {
    super("too_large");
    this.name = "TooLargeError";
  }
}
