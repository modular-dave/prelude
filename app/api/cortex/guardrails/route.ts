import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";

// In-memory guardrail stats
const guardrailStats = {
  inputBlocked: 0,
  outputBlocked: 0,
  reasons: {} as Record<string, number>,
};

function recordInputBlock(reason: string) {
  guardrailStats.inputBlocked++;
  guardrailStats.reasons[reason] = (guardrailStats.reasons[reason] || 0) + 1;
}

function recordOutputBlock(reason: string) {
  guardrailStats.outputBlocked++;
  guardrailStats.reasons[reason] = (guardrailStats.reasons[reason] || 0) + 1;
}

export async function GET() {
  try {
    return NextResponse.json(guardrailStats);
  } catch (err) {
    return apiError(String(err), 500);
  }
}
