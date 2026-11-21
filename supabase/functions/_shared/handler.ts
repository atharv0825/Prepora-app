// Edge Function template. Every function is:
//
//   Deno.serve(createHandler({ name: "my-fn", auth: "required", input: MySchema }, async (ctx) => {
//     return { ...json result... };       // or a Response
//   }));
//
// The wrapper handles: CORS + preflight, method check, region pinning, auth, input parsing +
// Zod validation, JSON responses, the error format { error: { code, message } }, request ids,
// and Sentry reporting of unexpected errors.

import { type User, ZodError, type ZodType } from "./deps.ts";
import { adminClient, type DbClient, getUser, userClient } from "./auth.ts";
import { corsHeaders, preflight } from "./cors.ts";
import { errors, HttpError } from "./errors.ts";
import { currentRegion, isPinnedRegion, PINNED_REGION } from "./region.ts";
import { captureException } from "./sentry.ts";

export type AuthMode = "required" | "optional" | "none";
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HandlerOptions<S extends ZodType | undefined> {
  /** Function name, used in logs and Sentry tags. */
  name: string;
  /** Allowed methods (default ["POST"]). OPTIONS is always handled. */
  methods?: Method[];
  /** "required" → 401 without a valid session. "optional" → user may be null. "none" → skip. */
  auth?: AuthMode;
  /** Zod schema for the input: query params for GET/DELETE, JSON body otherwise. */
  input?: S;
  /** Reject invocations outside PINNED_REGION. Turn on for every function that calls an AI API. */
  requirePinnedRegion?: boolean;
}

export interface HandlerContext<T> {
  req: Request;
  requestId: string;
  input: T;
  /** Signed-in user, or null when auth is "optional"/"none" and the caller is anonymous. */
  user: User | null;
  /** Acts as the caller; RLS applies. */
  supabase: DbClient;
  /** Service role; bypasses RLS. Created lazily — use only for server-owned writes. */
  admin: () => DbClient;
}

type Inferred<S> = S extends ZodType<infer O> ? O : undefined;

export function json(req: Request, status: number, body: unknown, requestId?: string): Response {
  const headers: Record<string, string> = {
    ...corsHeaders(req),
    "Content-Type": "application/json",
  };
  if (requestId) headers["x-request-id"] = requestId;
  return new Response(JSON.stringify(body), { status, headers });
}

async function readInput(req: Request, method: string): Promise<unknown> {
  if (method === "GET" || method === "DELETE") {
    return Object.fromEntries(new URL(req.url).searchParams);
  }
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw errors.badRequest("Body must be valid JSON");
  }
}

function zodDetails(err: ZodError) {
  return err.issues.map((i) => ({ path: i.path.join("."), message: i.message, code: i.code }));
}

export function createHandler<S extends ZodType | undefined = undefined>(
  opts: HandlerOptions<S>,
  fn: (ctx: HandlerContext<Inferred<S>>) => Promise<unknown | Response>,
): (req: Request) => Promise<Response> {
  const methods = opts.methods ?? ["POST"];
  const authMode = opts.auth ?? "required";

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return preflight(req);

    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    let user: User | null = null;

    try {
      if (!methods.includes(req.method as Method)) throw errors.methodNotAllowed(methods);

      if (opts.requirePinnedRegion && !isPinnedRegion()) {
        throw errors.wrongRegion(PINNED_REGION, currentRegion());
      }

      const supabase = userClient(req);
      if (authMode !== "none") {
        user = await getUser(req, supabase);
        if (authMode === "required" && !user) throw errors.unauthorized();
      }

      let input: unknown = undefined;
      if (opts.input) {
        const raw = await readInput(req, req.method);
        const parsed = opts.input.safeParse(raw);
        if (!parsed.success) throw errors.validation(zodDetails(parsed.error));
        input = parsed.data;
      }

      let admin: DbClient | undefined;
      const result = await fn({
        req,
        requestId,
        input: input as Inferred<S>,
        user,
        supabase,
        admin: () => (admin ??= adminClient()),
      });

      if (result instanceof Response) {
        const headers = new Headers(result.headers);
        for (const [k, v] of Object.entries(corsHeaders(req))) headers.set(k, v);
        headers.set("x-request-id", requestId);
        return new Response(result.body, { status: result.status, headers });
      }
      return json(req, 200, result ?? null, requestId);
    } catch (err) {
      if (err instanceof HttpError) {
        return json(req, err.status, err.toBody(), requestId);
      }
      if (err instanceof ZodError) {
        // A schema parse inside the handler body (e.g. validating an AI response).
        console.error(`[${opts.name}] ${requestId} unexpected ZodError`, err.issues);
      } else {
        console.error(`[${opts.name}] ${requestId}`, err);
      }
      await captureException(err, { fn: opts.name, requestId, userId: user?.id });
      return json(req, 500, errors.internal().toBody(), requestId);
    }
  };
}
