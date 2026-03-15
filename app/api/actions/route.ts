import { NextRequest, NextResponse } from "next/server";
import { recordAction, recordOutcome, learnFromActions } from "@/lib/clude";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type } = body as { type: "action" | "outcome" | "learn" };

    if (type === "action") {
      const id = await recordAction(body.record);
      return NextResponse.json({ id });
    }

    if (type === "outcome") {
      const id = await recordOutcome(body.record);
      return NextResponse.json({ id });
    }

    if (type === "learn") {
      const lessons = await learnFromActions();
      return NextResponse.json({ lessons });
    }

    return NextResponse.json({ error: "type must be action, outcome, or learn" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
