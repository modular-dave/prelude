import { NextResponse } from "next/server";
import { decay } from "@/lib/clude";

export async function POST() {
  try {
    const count = await decay();
    return NextResponse.json({ success: true, decayed: count });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
