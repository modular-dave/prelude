import { NextRequest, NextResponse } from "next/server";
import {
  setProviderConfig,
  getProviderConfig,
  getAllProviderConfigs,
  isProviderConnected,
  getActivePrimary,
} from "@/lib/provider-config-store";

// ── GET /api/providers ───────────────────────────────────────────
// Returns connection status for all hosted providers
export async function GET() {
  const configs = getAllProviderConfigs();
  const status: Record<string, { connected: boolean; baseUrl?: string; model?: string }> = {};

  for (const [id, cfg] of Object.entries(configs)) {
    status[id] = {
      connected: isProviderConnected(id),
      baseUrl: cfg.baseUrl,
      model: cfg.model,
    };
  }

  return NextResponse.json({ providers: status, activePrimary: getActivePrimary() });
}

// ── POST /api/providers ──────────────────────────────────────────
// Body: { provider: string, baseUrl?: string, apiKey?: string, model?: string }
// Saves provider config and patches process.env
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { provider, baseUrl, apiKey, model } = body as {
    provider: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };

  if (!provider) {
    return NextResponse.json({ error: "provider required" }, { status: 400 });
  }

  setProviderConfig(provider, { baseUrl, apiKey, model });

  // Verify connection by attempting a lightweight request
  const testUrl = baseUrl || getProviderConfig(provider)?.baseUrl;
  const testKey = apiKey || getProviderConfig(provider)?.apiKey;

  if (testUrl && testKey) {
    try {
      const res = await fetch(`${testUrl}/models`, {
        headers: {
          Authorization: `Bearer ${testKey}`,
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return NextResponse.json({
          ok: false,
          connected: false,
          warning: `Saved but API returned ${res.status}. Check your credentials.`,
        });
      }
      return NextResponse.json({ ok: true, connected: true });
    } catch {
      return NextResponse.json({
        ok: false,
        connected: false,
        warning: "Saved but could not verify connection. Check the base URL.",
      });
    }
  }

  return NextResponse.json({ ok: true, connected: !!apiKey });
}
