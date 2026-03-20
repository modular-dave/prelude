import { NextRequest, NextResponse } from "next/server";
import { recordAction, recordOutcome, learnFromActions } from "@/lib/clude";
import { recordMeterEvent } from "@/lib/cortex";
import { supabase } from "@/lib/supabase";
import { apiError } from "@/lib/api-utils";

export async function GET() {
  try {
    // Fetch action/outcome records from Supabase if available
    let actions: any[] = [];
    let outcomes: any[] = [];
    try {
      const { data: actionData } = await supabase
        .from("action_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      actions = actionData || [];

      const { data: outcomeData } = await supabase
        .from("outcome_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      outcomes = outcomeData || [];
    } catch {
      // Tables may not exist — that's OK
    }

    // Derive strategy count from procedural memories tagged with "strategy"
    let strategies: string[] = [];
    try {
      const { data } = await supabase
        .from("memories")
        .select("summary")
        .eq("memory_type", "procedural")
        .contains("tags", ["strategy"])
        .limit(20);
      strategies = (data || []).map((m: any) => m.summary);
    } catch {
      // non-critical
    }

    const positive = outcomes.filter((o: any) => o.sentiment === "positive").length;
    const negative = outcomes.filter((o: any) => o.sentiment === "negative").length;
    const neutral = outcomes.filter((o: any) => o.sentiment === "neutral").length;

    return NextResponse.json({
      actions,
      outcomes,
      strategies,
      stats: {
        actionsLogged: actions.length,
        outcomesRecorded: outcomes.length,
        positive,
        negative,
        neutral,
        strategiesLearned: strategies.length,
      },
    });
  } catch (err) {
    return apiError(String(err), 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type } = body as { type: "action" | "outcome" | "learn" };

    if (type === "action") {
      const id = await recordAction(body.record);
      recordMeterEvent("action_log");
      return NextResponse.json({ id });
    }

    if (type === "outcome") {
      const id = await recordOutcome(body.record);
      recordMeterEvent("outcome_log");
      return NextResponse.json({ id });
    }

    if (type === "learn") {
      recordMeterEvent("action_learn");
      const lessons = await learnFromActions();
      return NextResponse.json({ lessons });
    }

    return apiError("type must be action, outcome, or learn");
  } catch (err) {
    return apiError(String(err), 500);
  }
}
