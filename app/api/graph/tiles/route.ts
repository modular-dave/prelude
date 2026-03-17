import { NextRequest, NextResponse } from "next/server";
import { getCachedOutput } from "../compile/route";

export async function GET(req: NextRequest) {
  const output = getCachedOutput();
  if (!output) {
    return NextResponse.json(
      { error: "No compiled graph. POST to /api/graph/compile first." },
      { status: 404 },
    );
  }

  const tileId = req.nextUrl.searchParams.get("id");
  const chunkId = req.nextUrl.searchParams.get("chunkId");

  if (tileId) {
    const tile = output.tiles.get(tileId);
    if (!tile) {
      return NextResponse.json({ error: `Tile not found: ${tileId}` }, { status: 404 });
    }
    return NextResponse.json(tile);
  }

  if (chunkId) {
    const chunk = output.topologyChunks.get(chunkId);
    if (!chunk) {
      return NextResponse.json({ error: `Topology chunk not found: ${chunkId}` }, { status: 404 });
    }
    return NextResponse.json(chunk);
  }

  // No ID specified — return list of available tile and chunk IDs
  return NextResponse.json({
    tileIds: [...output.tiles.keys()],
    topologyChunkIds: [...output.topologyChunks.keys()],
  });
}
