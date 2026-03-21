import { NextRequest, NextResponse } from "next/server";
import { getPrivacyPolicy, setPrivacyPolicy } from "@/lib/cortex";
import { apiError } from "@/lib/api-utils";

export async function GET() {
  try {
    return NextResponse.json(getPrivacyPolicy());
  } catch (err) {
    return apiError(String(err), 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const current = getPrivacyPolicy();
    const updated = { ...current, ...body };
    setPrivacyPolicy(updated);
    return NextResponse.json(updated);
  } catch (err) {
    return apiError(String(err), 500);
  }
}
