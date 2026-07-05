#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Thin MCP client for the Vercel upload function. Runs locally (stdio), reads a
// local image, and returns a public capability URL you can paste into a PR body.
//
// Configure via env:
//   IMAGE_HOST_ENDPOINT  e.g. https://your-app.vercel.app/api/upload
//   IMAGE_HOST_TOKEN     the UPLOAD_TOKEN the server checks

const ENDPOINT = process.env.IMAGE_HOST_ENDPOINT;
const TOKEN = process.env.IMAGE_HOST_TOKEN;

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
};

async function uploadImage(filePath: string, filename?: string): Promise<string> {
  if (!ENDPOINT) throw new Error("IMAGE_HOST_ENDPOINT env var is not set");
  if (!TOKEN) throw new Error("IMAGE_HOST_TOKEN env var is not set");

  const bytes = await readFile(filePath); // throws a clear ENOENT if missing
  const name = filename ?? basename(filePath);
  const contentType = MIME_BY_EXT[extname(name).toLowerCase()];

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      filename: name,
      contentType,
      dataBase64: bytes.toString("base64"),
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`upload failed (${res.status}): ${text}`);
  }

  let url: unknown;
  try {
    url = JSON.parse(text)?.url;
  } catch {
    throw new Error(`unexpected response: ${text}`);
  }
  if (typeof url !== "string") throw new Error(`response had no url: ${text}`);
  return url;
}

const server = new McpServer({ name: "image-self-host", version: "0.1.0" });

server.registerTool(
  "upload_image",
  {
    title: "Upload image",
    description:
      "Upload a local image file to the configured image host and return a public, " +
      "unguessable URL. Use it to embed screenshots in GitHub PR descriptions/comments " +
      "(the URL renders inline, no browser or committed file needed).",
    inputSchema: {
      path: z.string().describe("Absolute path to the local image file to upload"),
      filename: z
        .string()
        .optional()
        .describe("Optional filename for the uploaded image (defaults to the source basename)"),
    },
  },
  async ({ path: filePath, filename }) => {
    try {
      const url = await uploadImage(filePath, filename);
      return { content: [{ type: "text", text: url }] };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: "text", text: `upload_image failed: ${detail}` }] };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
