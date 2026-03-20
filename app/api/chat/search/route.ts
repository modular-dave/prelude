import { NextRequest, NextResponse } from "next/server";
import { searchChat, type ChatMessage } from "@/lib/inference";
import { apiError } from "@/lib/api-utils";

export async function POST(req: NextRequest) {
  try {
    const { messages, query } = (await req.json()) as {
      messages: ChatMessage[];
      query?: string;
    };

    const result = await searchChat(messages, { query, maxTokens: 1024 });
    return NextResponse.json(result);
  } catch (err) {
    return apiError(String(err), 500);
  }
}
