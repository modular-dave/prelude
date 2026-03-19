import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { apiError } from "@/lib/api-utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!data) return apiError("Not found", 404);

    return NextResponse.json({
      id: data.id,
      title: data.title,
      summary: data.summary,
      messages: data.messages,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  } catch (err) {
    return apiError(String(err), 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.title !== undefined) updates.title = body.title;
    if (body.summary !== undefined) updates.summary = body.summary;
    if (body.messages !== undefined) updates.messages = body.messages;

    const { data, error } = await supabase
      .from("conversations")
      .update(updates)
      .eq("id", id)
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
    });
  } catch (err) {
    return apiError(String(err), 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Delete the conversation
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", id);

    if (error) throw error;

    // Cascade-delete associated memories
    try {
      await supabase.from("memories").delete().contains("tags", [`conv:${id}`]);
    } catch {
      // non-critical
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(String(err), 500);
  }
}
