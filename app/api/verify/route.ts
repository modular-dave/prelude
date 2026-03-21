import { NextRequest, NextResponse } from "next/server";
import { verifyOnChain } from "@/lib/clude";
import { apiError } from "@/lib/api-utils";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OWNER_WALLET) {
      return apiError("OWNER_WALLET not configured", 400);
    }

    const { memoryId } = (await req.json()) as { memoryId: number };
    if (!memoryId) {
      return apiError("memoryId is required");
    }

    const verified = await verifyOnChain(memoryId);
    return NextResponse.json({ verified, memoryId });
  } catch (err) {
    return apiError(String(err), 500);
  }
}
