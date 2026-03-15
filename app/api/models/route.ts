import { NextRequest, NextResponse } from "next/server";
import {
  getActiveModel,
  listInstalledModels,
  isServerRunning,
  killMLXServer,
  startMLXServer,
  installModel,
  uninstallModel,
} from "@/lib/mlx-server";

export async function GET() {
  try {
    const [installed, active, running] = await Promise.all([
      listInstalledModels(),
      getActiveModel(),
      isServerRunning(),
    ]);
    return NextResponse.json({ installed, active, running });
  } catch {
    return NextResponse.json({ installed: [], active: null, running: false });
  }
}

export async function POST(req: NextRequest) {
  const { action, model } = (await req.json()) as { action: string; model: string };

  if (!model) {
    return NextResponse.json({ error: "model required" }, { status: 400 });
  }

  if (action === "switch") {
    try {
      killMLXServer();
      const ready = await startMLXServer(model);
      if (!ready) {
        return NextResponse.json({ error: "Server failed to start within timeout" }, { status: 502 });
      }
      return NextResponse.json({ ok: true, model });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to switch model" },
        { status: 500 },
      );
    }
  }

  if (action === "install") {
    const result = installModel(model);
    if (!result.success) {
      return NextResponse.json({ error: result.error || "Install failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, model });
  }

  if (action === "uninstall") {
    const result = uninstallModel(model);
    if (!result.success) {
      return NextResponse.json({ error: result.error || "Uninstall failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, model });
  }

  return NextResponse.json({ error: "Invalid action. Use: switch, install, uninstall" }, { status: 400 });
}
