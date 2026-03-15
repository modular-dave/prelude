import { NextRequest, NextResponse } from "next/server";
import { ensureCortex } from "@/lib/cortex";
import { getDb } from "clude-bot/dist/core/database";

export async function GET(req: NextRequest) {
  try {
    const memoryId = req.nextUrl.searchParams.get("memoryId");
    if (!memoryId) {
      return NextResponse.json({ error: "memoryId required" }, { status: 400 });
    }

    await ensureCortex();
    const db = getDb();
    const { data, error } = await db
      .from("memory_links")
      .select("*")
      .or(`source_id.eq.${memoryId},target_id.eq.${memoryId}`)
      .order("strength", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
