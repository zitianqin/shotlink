#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { upload } from "@vercel/blob/client";
import { z } from "zod";
// shotlink MCP client. Runs locally (stdio) so it can read local image files,
// uploads them to the hosted shotlink endpoint, and returns a public URL.
//
// Config (in order of precedence):
//   token:    --token=<sl_...>   or  SHOTLINK_TOKEN env
//   endpoint: --endpoint=<url>   or  SHOTLINK_ENDPOINT env   (defaults to prod)
const DEFAULT_ENDPOINT = "https://shotlink-zitian-qins-projects.vercel.app/api/upload";
function argValue(name) {
    const prefix = `--${name}=`;
    const hit = process.argv.find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : undefined;
}
const ENDPOINT = argValue("endpoint") ?? process.env.SHOTLINK_ENDPOINT ?? DEFAULT_ENDPOINT;
const TOKEN = argValue("token") ?? process.env.SHOTLINK_TOKEN;
const MAX_BYTES = 50 * 1024 * 1024;
const MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
};
async function uploadImage(filePath, filename) {
    if (!TOKEN) {
        throw new Error("No shotlink token. Pass --token=sl_... in the MCP args or set SHOTLINK_TOKEN. " +
            "Get one at https://shotlink-zitian-qins-projects.vercel.app");
    }
    const bytes = await readFile(filePath); // throws a clear ENOENT if missing
    const name = filename ?? basename(filePath);
    const contentType = MIME_BY_EXT[extname(name).toLowerCase()];
    if (bytes.length > MAX_BYTES) {
        throw new Error(`file is ${(bytes.length / 1048576).toFixed(1)}MB; shotlink's limit is 50MB`);
    }
    // Direct-to-Blob client upload: the bytes go straight to Blob storage (not
    // through the function), so this isn't bound by Vercel's ~4.5MB body limit.
    // /api/upload only authorizes it (validates the token + size in clientPayload).
    const blob = await upload(name, bytes, {
        access: "public",
        handleUploadUrl: ENDPOINT,
        clientPayload: JSON.stringify({ token: TOKEN, size: bytes.length }),
        contentType,
        multipart: bytes.length > 8 * 1024 * 1024, // parallel parts for big files
    });
    return blob.url;
}
const server = new McpServer({ name: "shotlink", version: "0.2.0" });
server.registerTool("upload_image", {
    title: "Upload image or video",
    description: "Upload a local image or video file (mp4/mov/webm) to shotlink and return a public, " +
        "unguessable URL. Use it to embed screenshots in GitHub PR descriptions/comments (the " +
        "URL renders inline, no browser or committed file needed). Note: GitHub only renders " +
        "images inline — for videos, embed a GIF preview and link the mp4.",
    inputSchema: {
        path: z.string().describe("Absolute path to the local image or video file to upload"),
        filename: z
            .string()
            .optional()
            .describe("Optional filename for the uploaded image (defaults to the source basename)"),
    },
}, async ({ path: filePath, filename }) => {
    try {
        const url = await uploadImage(filePath, filename);
        return { content: [{ type: "text", text: url }] };
    }
    catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: "text", text: `upload_image failed: ${detail}` }] };
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
