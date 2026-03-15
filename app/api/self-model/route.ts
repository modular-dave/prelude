import { NextResponse } from "next/server";
import { selfModel } from "@/lib/clude";

export async function GET() {
  try {
    const memories = await selfModel();
    return NextResponse.json(memories);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
