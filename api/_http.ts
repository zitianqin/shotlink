// Minimal shapes for Vercel Node functions, so we don't need the @vercel/node
// dev dependency (which would be installed on every `npx` of the MCP client).

export interface Req {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface Res {
  status(code: number): Res;
  json(body: unknown): Res;
  send(body: string): Res;
  setHeader(name: string, value: string | string[]): void;
  end(body?: string): void;
}
