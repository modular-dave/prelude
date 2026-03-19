import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { parseIntParam } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  try {
    const limit = parseIntParam(req.nextUrl.searchParams.get("limit"), 10000, 1, 50000);

    const { data, error } = await supabase
      .from("memory_links")
      .select("source_id, target_id, link_type, strength")
      .order("strength", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
