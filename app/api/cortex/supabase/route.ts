import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resetCortex } from "@/lib/cortex";
import { persistEnv, removeEnv } from "@/lib/env-persist";

export async function POST(req: Request) {
  const body = await req.json();
  const { action, url, serviceKey } = body as {
    action: "test" | "save" | "disconnect";
    url?: string;
    serviceKey?: string;
  };

  if (action === "test") {
    if (!url || !serviceKey) {
      return NextResponse.json(
        { ok: false, error: "URL and Service Key are required" },
        { status: 400 },
      );
    }
    try {
      const client = createClient(url, serviceKey);
      // Simple query to verify connection
      const { error } = await client
        .from("memories")
        .select("id")
        .limit(1);
      if (error) {
        return NextResponse.json({ ok: false, error: error.message });
      }
      return NextResponse.json({ ok: true });
    } catch (e: unknown) {
      return NextResponse.json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (action === "disconnect") {
    removeEnv(["SUPABASE_URL", "SUPABASE_SERVICE_KEY"]);
    resetCortex();
    return NextResponse.json({ ok: true });
  }

  if (action === "save") {
    if (!url || !serviceKey) {
      return NextResponse.json(
        { ok: false, error: "URL and Service Key are required" },
        { status: 400 },
      );
    }
    persistEnv({ SUPABASE_URL: url, SUPABASE_SERVICE_KEY: serviceKey });
    resetCortex();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
