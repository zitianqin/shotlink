#!/usr/bin/env node
// Admin report: every token (user) with its most recent uploads.
//   node --env-file=.env.local scripts/users.mjs [perUser=10]
// Needs BLOB_READ_WRITE_TOKEN (pull with `vercel env pull .env.local`).
// Costs a few Blob Advanced Operations (one per 1,000 blobs listed).
// Only uploads from clients >= 0.3 (stored under u/<id>/) are attributed.
import { list } from "@vercel/blob";

const perUser = Number(process.argv[2] ?? 10);
const all = [];
let cursor;
do {
  const r = await list({ limit: 1000, cursor });
  all.push(...r.blobs);
  cursor = r.hasMore ? r.cursor : undefined;
} while (cursor);

const byUser = new Map();
let unattributed = 0;
for (const b of all) {
  const m = b.pathname.match(/^u\/([0-9a-f]{12})\//);
  if (!m) { if (!b.pathname.startsWith("tokens/")) unattributed++; continue; }
  if (!byUser.has(m[1])) byUser.set(m[1], []);
  byUser.get(m[1]).push(b);
}

const users = [];
for (const t of all.filter((b) => b.pathname.startsWith("tokens/"))) {
  const id = t.pathname.slice(7, 19);
  const rec = await (await fetch(t.url)).json().catch(() => ({}));
  const uploads = (byUser.get(id) ?? []).sort((a, b) => b.uploadedAt - a.uploadedAt);
  users.push({ id, label: rec.label ?? "(no label)", createdAt: rec.createdAt ?? "?", uploads });
}
users.sort((a, b) => (b.uploads[0]?.uploadedAt ?? 0) - (a.uploads[0]?.uploadedAt ?? 0));

for (const u of users) {
  const last = u.uploads[0]?.uploadedAt.toISOString().slice(0, 16).replace("T", " ") ?? "no attributed uploads";
  console.log(`\n${u.label}  [${u.id}]  created ${u.createdAt.slice(0, 10)}  uploads ${u.uploads.length}  last ${last}`);
  for (const b of u.uploads.slice(0, perUser)) console.log(`  ${b.url}`);
}
console.log(`\n${unattributed} older uploads have no user (made before client 0.3).`);
