import { NextResponse } from "next/server";
import { removeEnv } from "@/lib/env-persist";

export async function POST(req: Request) {
  const body = await req.json();
  const { action } = body as { action: "disconnect" };

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
