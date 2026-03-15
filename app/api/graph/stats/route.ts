import { NextResponse } from "next/server";
import { graphStats } from "@/lib/clude";

export async function GET() {
  try {
    const stats = await graphStats();
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
