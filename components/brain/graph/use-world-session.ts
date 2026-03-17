// ── World Session Hook ──────────────────────────────────────────────
// Initializes the world model from manifest, sets up tile-cache,
// and manages the runtime lifecycle.

import { useEffect, useRef, useState } from "react";
import { useMemory } from "@/lib/memory-context";
import { TYPE_COLORS } from "@/lib/types";
import { ENTITY_COLORS, DEFAULT_ENTITY_COLOR } from "@/lib/3d-graph/constants";
import { compileGraph, memoryContextToRawGraph } from "@/lib/3d-graph/compiler/build";
import type { CompilerOutput } from "@/lib/3d-graph/compiler/build";
import type { CanonicalEntity } from "@/lib/3d-graph/compiler/types";
import { WorldModel } from "@/lib/3d-graph/runtime/world-model";
import { TileCache } from "@/lib/3d-graph/runtime/tile-cache";
import { ViewStateManager } from "@/lib/3d-graph/runtime/view-state";
import type { Lens } from "@/lib/3d-graph/runtime/types";

export interface WorldSession {
  worldModel: WorldModel | null;
  tileCache: TileCache | null;
  viewState: ViewStateManager;
  compilerOutput: CompilerOutput | null;
  isReady: boolean;
  allEntities: CanonicalEntity[];
  entityById: Map<string, CanonicalEntity>;
  nodeNumericIdMap: Map<string, number | null>;
  bubbleRadius: number;
}

export function useWorldSession(lens: Lens): WorldSession {
  const { memories, knowledgeGraph } = useMemory();
  const viewStateRef = useRef(new ViewStateManager(lens));
  const [isReady, setIsReady] = useState(false);
  const [compilerOutput, setCompilerOutput] = useState<CompilerOutput | null>(null);
  const tileCacheRef = useRef<TileCache | null>(null);
  const worldModelRef = useRef<WorldModel | null>(null);

  // Recompile when data changes
  useEffect(() => {
    if (!memories || memories.length === 0) return;

    const rawGraph = memoryContextToRawGraph(
      memories,
      knowledgeGraph || { nodes: [], edges: [] },
      TYPE_COLORS,
      ENTITY_COLORS,
      DEFAULT_ENTITY_COLOR,
    );

    const output = compileGraph(rawGraph);
    setCompilerOutput(output);

    // Create world model
    const model = new WorldModel(output.manifest);
    worldModelRef.current = model;

    // Create tile cache and inject all compiled tiles directly (no HTTP fetch)
    const cache = new TileCache(model);
    tileCacheRef.current = cache;

    for (const [tileId, tile] of output.tiles) {
      cache.injectTile(tileId, tile);
    }
    for (const [chunkId, chunk] of output.topologyChunks) {
      cache.injectTopologyChunk(chunkId, chunk);
    }

    setIsReady(true);

    return () => {
      cache.dispose();
    };
  }, [memories, knowledgeGraph]);

  // Update lens on viewState when it changes
  useEffect(() => {
    viewStateRef.current.setLens(lens);
  }, [lens]);

  // Build entity lookups
  const allEntities = compilerOutput
    ? [...compilerOutput.entities.values()]
    : [];

  const entityById = compilerOutput?.entities ?? new Map<string, CanonicalEntity>();

  const nodeNumericIdMap = useRef(new Map<string, number | null>());
  useEffect(() => {
    const map = new Map<string, number | null>();
    if (compilerOutput) {
      for (const entity of compilerOutput.entities.values()) {
        map.set(entity.id, entity.numericId);
      }
    }
    nodeNumericIdMap.current = map;
  }, [compilerOutput]);

  return {
    worldModel: worldModelRef.current,
    tileCache: tileCacheRef.current,
    viewState: viewStateRef.current,
    compilerOutput,
    isReady,
    allEntities,
    entityById,
    nodeNumericIdMap: nodeNumericIdMap.current,
    bubbleRadius: compilerOutput?.manifest.bubbleRadius ?? 400,
  };
}
