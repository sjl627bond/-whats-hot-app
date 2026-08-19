import { createClient } from "@supabase/supabase-js";
import { performAccountDeletion } from "../_shared/account-deletion-core.mjs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
});

function bearerToken(request: Request) {
  const value = request.headers.get("Authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function decodeJwtPayload(token: string) {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return null;
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    return JSON.parse(atob(normalized));
  } catch { return null; }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const operationId = crypto.randomUUID();
  const token = bearerToken(request);
  if (!token) return json({ error: "Authentication required.", operation_id: operationId }, 401);

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request.", operation_id: operationId }, 400); }
  if ("user_id" in body || "userId" in body) return json({ error: "Account targets are not accepted.", operation_id: operationId }, 400);
  if (body.confirmation !== true) return json({ error: "Deletion confirmation is required.", operation_id: operationId }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(JSON.stringify({ event: "account_deletion_failed", operationId, stage: "configuration" }));
    return json({ error: "Account deletion is temporarily unavailable.", operation_id: operationId }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user?.id) return json({ error: "Authentication required.", operation_id: operationId }, 401);

  const claims = decodeJwtPayload(token);
  const issuedAt = Number(claims?.iat || 0);
  const sessionId = typeof claims?.session_id === "string" ? claims.session_id : "";
  if (!issuedAt || !sessionId || Math.floor(Date.now() / 1000) - issuedAt > 600) {
    return json({ error: "Sign in again before deleting your account.", code: "reauthentication_required", operation_id: operationId }, 403);
  }

  console.info(JSON.stringify({ event: "account_deletion_started", operationId }));
  try {
    const result = await performAccountDeletion({ admin, userId: user.id, operationId });
    console.info(JSON.stringify({ event: "account_deletion_completed", operationId, removedObjects: result.removedObjects }));
    return json({ deleted: true, operation_id: operationId });
  } catch (error) {
    const stage = error instanceof Error && "stage" in error ? String(error.stage) : "unknown";
    console.error(JSON.stringify({ event: "account_deletion_failed", operationId, stage }));
    return json({ error: "Account deletion could not be completed. Your request remains available to retry.", operation_id: operationId }, 500);
  }
});
