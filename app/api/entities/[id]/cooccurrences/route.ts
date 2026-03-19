import { NextRequest, NextResponse } from "next/server";
import { entityCooccurrences } from "@/lib/clude";
import { parseIntParam } from "@/lib/api-utils";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const minCooccurrence = parseIntParam(req.nextUrl.searchParams.get("min"), 1, 1, 100);
    const maxResults = parseIntParam(req.nextUrl.searchParams.get("limit"), 20, 1, 500);

    const cooccurrences = await entityCooccurrences(parseInt(id, 10), { minCooccurrence, maxResults });
    return NextResponse.json(cooccurrences);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
