// CORS. Set ALLOWED_ORIGINS (comma-separated) as a function secret per environment, e.g.
//   https://prepora.com,https://admin.prepora.com,https://*.workers.dev
// A leading "*." matches any subdomain (for preview deploys).
// If ALLOWED_ORIGINS is unset (local dev), every origin is allowed.

const ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type, x-region, x-request-id";
const ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

function parseAllowList(): string[] | null {
  const raw = Deno.env.get("ALLOWED_ORIGINS");
  if (!raw) return null;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

const allowList = parseAllowList();

function originAllowed(origin: string): boolean {
  if (!allowList) return true;
  return allowList.some((rule) => {
    if (rule === "*") return true;
    if (rule.includes("://*.")) {
      const [scheme, host] = rule.split("://*.");
      return origin.startsWith(`${scheme}://`) && origin.endsWith(`.${host}`);
    }
    return rule === origin;
  });
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (!allowList) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (origin && originAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function preflight(req: Request): Response {
  return new Response("ok", { headers: corsHeaders(req) });
}
