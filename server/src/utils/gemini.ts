// Thin wrapper around Google's Gemini "generateContent" REST API — no
// @google/generative-ai SDK dependency, just Node's built-in `fetch`
// (available globally since Node 18, which is already this project's
// minimum supported version — see README Prerequisites). Kept deliberately
// tiny: one text-in, text-out call, used by both the AI Settings "Test
// Connection" button (routes/settings.ts) and the AI Analysis feature
// itself (routes/aiAnalysis.ts).
//
// `model` is plain free text rather than a hardcoded/enum value on purpose
// — Gemini's available model names change over time (e.g. new "-flash"/
// "-pro" releases, older ones retiring), and hardcoding one here would mean
// a code change every time Google renames or retires a model. An admin
// enters whatever current model name their API key has access to in
// Admin -> AI Settings; this function just slots it into the URL.
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Node's built-in fetch (undici) always throws a generic top-level
// "fetch failed" message on network errors — the actually useful info
// (DNS failure, connection refused, timeout, TLS error, etc.) lives in
// `err.cause`, which undici sets to the underlying system error. This
// unwraps that so the AI Analysis tab and "Test Connection" button show
// something an admin can act on instead of just "fetch failed".
function describeFetchError(err: any): string {
  const cause = err?.cause ?? err;
  const code: string | undefined = cause?.code;

  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "DNS lookup failed for generativelanguage.googleapis.com. The server can't resolve this hostname — check its DNS configuration/resolver.";
    case "ECONNREFUSED":
      return "Connection refused by generativelanguage.googleapis.com. A firewall, proxy, or security-group rule is likely blocking outbound HTTPS (port 443) from this server.";
    case "ETIMEDOUT":
    case "UND_ERR_CONNECT_TIMEOUT":
      return "Connection to generativelanguage.googleapis.com timed out. This usually means outbound traffic to Google's API is being silently dropped by a firewall or egress policy, rather than actively refused.";
    case "ECONNRESET":
      return "Connection to generativelanguage.googleapis.com was reset mid-request. This can happen with a misconfigured proxy or an upstream network device terminating the connection.";
    case "CERT_HAS_EXPIRED":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
      return `TLS/certificate error while connecting to Gemini (${code}). Check the server's CA certificates or any TLS-intercepting proxy.`;
    default:
      // Unrecognized cause — surface whatever detail we have rather than
      // silently swallowing it, so it's still possible to diagnose.
      return cause?.message
        ? `${cause.message}${code ? ` (${code})` : ""}`
        : err?.message || "unknown network error";
  }
}

export async function callGemini(apiKey: string, model: string, prompt: string): Promise<string> {
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
  } catch (err: any) {
    throw new Error(`Could not reach the Gemini API: ${describeFetchError(err)}`);
  }

  const body: any = await res.json().catch(() => null);

  if (!res.ok) {
    // Gemini's error shape is { error: { code, message, status } }.
    const message = body?.error?.message || `Gemini API returned ${res.status}`;
    throw new Error(message);
  }

  const parts = body?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p: any) => p?.text || "").join("") : "";

  if (!text.trim()) {
    // A common cause: the response was blocked by a safety filter instead
    // of producing candidates at all — surface whatever reason Gemini gave.
    const blockReason = body?.promptFeedback?.blockReason;
    throw new Error(blockReason ? `Gemini blocked this request (${blockReason})` : "Gemini returned an empty response");
  }

  return text.trim();
}
