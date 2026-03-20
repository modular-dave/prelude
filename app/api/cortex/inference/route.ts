import { NextResponse } from "next/server";
import { removeEnv } from "@/lib/env-persist";

export async function POST(req: Request) {
  const body = await req.json();
  const { action } = body as { action: "disconnect" | "verify" };

  // Server-side inference connectivity test
  if (action === "verify") {
    const { baseUrl, model, apiKey } = body as { baseUrl: string; model: string; apiKey?: string };
    if (!baseUrl || !model) {
      return NextResponse.json({ ok: false, error: "baseUrl and model required" });
    }
    try {
      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 1, stream: false }),
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) {
        const data = await r.json();
        return NextResponse.json({ ok: !!data.choices });
      }
      const data = await r.json().catch(() => ({}));
      return NextResponse.json({ ok: false, error: data.error?.message || `HTTP ${r.status}` });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "connection failed" });
    }
  }

  if (action === "disconnect") {
    removeEnv([
      "VENICE_BASE_URL", "VENICE_API_KEY", "VENICE_MODEL",
      "LLM_BASE_URL", "LLM_MODEL", "INFERENCE_PRIMARY",
      "INFERENCE_CHAT_MODEL", "INFERENCE_CHAT_PROVIDER",
      "INFERENCE_DREAM_MODEL", "INFERENCE_DREAM_PROVIDER",
      "INFERENCE_REFLECT_MODEL", "INFERENCE_REFLECT_PROVIDER",
    ]);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
