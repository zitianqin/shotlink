#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// shotlink MCP client. Runs locally (stdio) so it can read local image files,
// uploads them to the hosted shotlink endpoint, and returns a public URL.
//
// Config (in order of precedence):
//   token:    --token=<sl_...>   or  SHOTLINK_TOKEN env
//   endpoint: --endpoint=<url>   or  SHOTLINK_ENDPOINT env   (defaults to prod)

const DEFAULT_ENDPOINT = "https://shotlink.vercel.app/api/upload";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const ENDPOINT = argValue("endpoint") ?? process.env.SHOTLINK_ENDPOINT ?? DEFAULT_ENDPOINT;
const TOKEN = argValue("token") ?? process.env.SHOTLINK_TOKEN;

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
  if (!TOKEN) {
    throw new Error(
      "No shotlink token. Pass --token=sl_... in the MCP args or set SHOTLINK_TOKEN. " +
        "Get one at https://shotlink.vercel.app",
    );
  }

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

const server = new McpServer({ name: "shotlink", version: "0.2.0" });

server.registerTool(
  "upload_image",
  {
    title: "Upload image",
    description:
      "Upload a local image file to shotlink and return a public, unguessable URL. " +
      "Use it to embed screenshots in GitHub PR descriptions/comments (the URL renders " +
      "inline, no browser or committed file needed).",
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
