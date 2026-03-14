import { NextRequest, NextResponse } from "next/server";

const LLM_BASE = process.env.LLM_BASE_URL || "http://localhost:8899";

export async function GET() {
  try {
    const res = await fetch(`${LLM_BASE}/v1/models`);
    if (!res.ok) {
      return NextResponse.json({ models: [], error: "Backend unreachable" }, { status: 502 });
    }
    const json = await res.json();
    const loaded = (json.data || []).map((m: { id: string }) => m.id);
    return NextResponse.json({ models: loaded });
  } catch {
    return NextResponse.json({ models: [], error: "Backend unreachable" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const { model } = (await req.json()) as { model: string };
  if (!model) {
    return NextResponse.json({ error: "model required" }, { status: 400 });
  }

  // Ping the backend with a tiny completion to force-load the model
  try {
    const res = await fetch(`${LLM_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
        stream: false,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: 502 });
    }

    return NextResponse.json({ ok: true, model });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load model" },
      { status: 502 },
    );
  }
}
