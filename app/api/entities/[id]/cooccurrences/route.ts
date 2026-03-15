import { NextRequest, NextResponse } from "next/server";
import { entityCooccurrences } from "@/lib/clude";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const minCooccurrence = parseInt(req.nextUrl.searchParams.get("min") ?? "1", 10);
    const maxResults = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);

    const cooccurrences = await entityCooccurrences(parseInt(id, 10), { minCooccurrence, maxResults });
    return NextResponse.json(cooccurrences);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
