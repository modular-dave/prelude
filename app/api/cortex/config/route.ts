import { NextRequest, NextResponse } from "next/server";
import {
  loadEngineConfig,
  updateEngineConfig,
  resetEngineConfig,
  applyEngineConfigToSDK,
  type EngineConfig,
} from "@/lib/engine-config";
import { apiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const config = loadEngineConfig();
    return NextResponse.json(config);
  } catch (err) {
    return apiError(String(err), 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Handle reset action
    if (body._action === "reset") {
      const config = resetEngineConfig();
      applyEngineConfigToSDK(config);
      return NextResponse.json(config);
    }

    const partial = body as Partial<EngineConfig>;
    const config = updateEngineConfig(partial);
    applyEngineConfigToSDK(config);
    return NextResponse.json(config);
  } catch (err) {
    return apiError(String(err), 500);
  }
}
