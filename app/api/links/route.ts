import { NextRequest, NextResponse } from "next/server";
import { ensureCortex } from "@/lib/cortex";
import { getDb } from "clude-bot/dist/core/database";
import { apiError } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  try {
    const memoryId = req.nextUrl.searchParams.get("memoryId");
    if (!memoryId) {
      return apiError("memoryId required");
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
    return apiError(String(err), 500);
  }
}
