import { NextRequest, NextResponse } from "next/server";
import { getCognitiveRoutes, setCognitiveRoute, resetCognitiveRoutes } from "@/lib/cortex";
import { apiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const routes = getCognitiveRoutes();
    return NextResponse.json(routes);
  } catch (err) {
    return apiError(String(err), 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body._action === "reset") {
      resetCognitiveRoutes();
      return NextResponse.json({ success: true, routes: {} });
    }

    const { function: fn, route } = body as {
      function: string;
      route: { provider: string; model: string };
    };

    if (!fn || !route?.provider || !route?.model) {
      return apiError("function, route.provider, and route.model are required");
    }

    setCognitiveRoute(fn, route);
    return NextResponse.json({ success: true, routes: getCognitiveRoutes() });
  } catch (err) {
    return apiError(String(err), 500);
  }
}
