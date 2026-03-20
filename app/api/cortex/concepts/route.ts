import { NextRequest, NextResponse } from "next/server";
import { loadEngineConfig, updateEngineConfig } from "@/lib/engine-config";
import { apiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const config = loadEngineConfig();
    return NextResponse.json(config.memoryConcepts);
  } catch (err) {
    return apiError(String(err), 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { add, remove } = body as { add?: string[]; remove?: string[] };
    const config = loadEngineConfig();
    let concepts = [...config.memoryConcepts];

    if (remove && remove.length > 0) {
      concepts = concepts.filter((c) => !remove.includes(c));
    }
    if (add && add.length > 0) {
      for (const c of add) {
        const normalized = c.trim().toLowerCase().replace(/\s+/g, "_");
        if (normalized && !concepts.includes(normalized)) {
          concepts.push(normalized);
        }
      }
    }

    updateEngineConfig({ memoryConcepts: concepts });
    return NextResponse.json(concepts);
  } catch (err) {
    return apiError(String(err), 500);
  }
}
