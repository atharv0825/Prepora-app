// POST /functions/v1/ai-stub (M6-I1): a DeepSeek stand-in for CI and local testing. See
// _shared/ai_stub.ts. Answers 404 unless the AI_STUB secret is "1" (never set on staging or
// production), so deploying it with the other functions is harmless.
import { handleStub } from "../_shared/ai_stub.ts";

Deno.serve((req) => handleStub(req, Deno.env.get("AI_STUB") === "1"));
