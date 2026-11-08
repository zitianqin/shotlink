import { createHash, randomBytes } from "node:crypto";
import { put, list, del, head, BlobNotFoundError } from "@vercel/blob";

// Per-user token store, backed by the same Vercel Blob store as the images.
//
// A token is `sl_<40 hex>`. We never store the token itself — only a record at
// the deterministic path `tokens/<sha256(token)>.json`. The path is the hash of a
// secret, so it is neither guessable nor enumerable (listing needs the server-side
// BLOB_READ_WRITE_TOKEN), and the record body holds no secret. Verification looks
// the record up by exact path with head() — a fresh Blob API call (so revocation
// takes effect at once) that counts as a Simple Operation, unlike list(), which is
// an Advanced Operation (Hobby gets 2,000 of those per rolling 30 days).

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

/** URL of the token's record blob, or null if there is none. */
async function findRecordUrl(token: string): Promise<string | null> {
  const wanted = pathFor(token);
  try {
    return (await head(wanted)).url;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    // head() by pathname isn't in this SDK version's typed contract; if the API
    // ever rejects it, fall back to the (Advanced Operation) prefix listing.
    const { blobs } = await list({ prefix: PREFIX, limit: 1000 });
    return blobs.find((b) => b.pathname === wanted)?.url ?? null;
  }
}

export async function isValidToken(token: string): Promise<boolean> {
  if (!TOKEN_RE.test(token)) return false;
  return (await findRecordUrl(token)) !== null;
}

export async function revokeToken(token: string): Promise<boolean> {
  if (!TOKEN_RE.test(token)) return false;
  const url = await findRecordUrl(token);
  if (!url) return false;
  await del(url);
  return true;
}
