import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { apiError } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10);

    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Map snake_case DB columns to camelCase for frontend
    const conversations = (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      messages: row.messages,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      source: row.source ?? "internal",
    }));

    return NextResponse.json(conversations);
  } catch (err) {
    return apiError(String(err), 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, title, summary, messages, createdAt, updatedAt, source } = body;

    const row: Record<string, unknown> = {
      title: title ?? "New conversation",
      messages: messages ?? [],
    };

    // Allow explicit ID for seeding
    if (id) row.id = id;
    if (summary) row.summary = summary;
    if (createdAt) row.created_at = createdAt;
    if (updatedAt) row.updated_at = updatedAt;
    if (source) row.source = source;

    const { data, error } = await supabase
      .from("conversations")
      .upsert(row, { onConflict: "id" })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      id: data.id,
      title: data.title,
      summary: data.summary,
      messages: data.messages,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      source: data.source ?? "internal",
    });
  } catch (err) {
    return apiError(String(err), 500);
  }
}
