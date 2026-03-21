import { NextRequest, NextResponse } from "next/server";
import { extractEntities } from "@/lib/clude";
import { apiError } from "@/lib/api-utils";

export async function POST(req: NextRequest) {
  try {
    const { memoryId, content, summary, relatedUser } = (await req.json()) as {
      memoryId: number;
      content: string;
      summary: string;
      relatedUser?: string;
    };

    if (!memoryId || !content) {
      return apiError("memoryId and content are required");
    }

    await extractEntities(memoryId, content, summary || content.slice(0, 200), relatedUser);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(String(err), 500);
  }
}
