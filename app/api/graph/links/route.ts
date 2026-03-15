import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "10000", 10);

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
