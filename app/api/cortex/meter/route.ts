import { NextResponse } from "next/server";
import { getMeterLog, getMeterSummary } from "@/lib/cortex";
import { apiError } from "@/lib/api-utils";

export async function GET() {
  try {
    let veniceStats = null;
    try {
      // eslint-disable-next-line no-eval, @typescript-eslint/no-require-imports
      const { createRequire } = eval("require")("module");
      const internalRequire = createRequire(eval("require").resolve("clude-bot"));
      const venice = internalRequire("../core/venice-client");
      if (venice.isVeniceEnabled && venice.isVeniceEnabled()) {
        veniceStats = venice.getVeniceStats ? venice.getVeniceStats() : null;
      }
    } catch {
      // Venice stats not available
    }

    return NextResponse.json({
      meterLog: getMeterLog().slice(-100), // last 100 events
      meterSummary: getMeterSummary(),
      veniceStats,
    });
  } catch (err) {
    return apiError(String(err), 500);
  }
}
