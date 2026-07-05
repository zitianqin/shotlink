import { createHash, randomBytes } from "node:crypto";
import { put, list, del } from "@vercel/blob";

// Per-user token store, backed by the same Vercel Blob store as the images.
//
// A token is `sl_<40 hex>`. We never store the token itself — only a record at
// the deterministic path `tokens/<sha256(token)>.json`. The path is the hash of a
// secret, so it is neither guessable nor enumerable (listing needs the server-side
// BLOB_READ_WRITE_TOKEN), and the record body holds no secret. Verification lists
// the `tokens/` prefix (a fresh Blob API call, so revocation takes effect at once).

const PREFIX = "tokens/";
const TOKEN_RE = /^sl_[0-9a-f]{40}$/;

export interface TokenRecord {
  createdAt: string;
  label?: string;
}

function pathFor(token: string): string {
  const hash = createHash("sha256").update(token).digest("hex");
  return `${PREFIX}${hash}.json`;
}

export async function issueToken(label: string | undefined, createdAt: string): Promise<string> {
  const token = "sl_" + randomBytes(20).toString("hex");
  const record: TokenRecord = { createdAt, ...(label ? { label } : {}) };
  await put(pathFor(token), JSON.stringify(record), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
  return token;
}

export async function isValidToken(token: string): Promise<boolean> {
  if (!TOKEN_RE.test(token)) return false;
  const wanted = pathFor(token);
  // Small team → a single page of results. Fresh (not CDN-cached), so a revoked
  // token stops working immediately.
  const { blobs } = await list({ prefix: PREFIX, limit: 1000 });
  return blobs.some((b) => b.pathname === wanted);
}

export async function revokeToken(token: string): Promise<boolean> {
  if (!TOKEN_RE.test(token)) return false;
  const wanted = pathFor(token);
  const { blobs } = await list({ prefix: PREFIX, limit: 1000 });
  const match = blobs.find((b) => b.pathname === wanted);
  if (!match) return false;
  await del(match.url);
  return true;
}
