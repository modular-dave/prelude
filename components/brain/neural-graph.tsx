"use client";

import { useCallback, useRef, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { useMemory } from "@/lib/memory-context";
import { TYPE_COLORS, DECAY_RATES } from "@/lib/types";
import type { ViewMode } from "@/lib/types";
import * as THREE from "three";

const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
});

const TYPE_BOOSTS: Record<string, number> = {
  semantic: 1.15,
  procedural: 1.12,
  self_model: 1.10,
  introspective: 1.08,
  episodic: 1.0,
};

/** Mix a hex color toward black. factor 0 = black, 1 = original */
function dimHex(hex: string, factor: number): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Blend two hex colors. t=0 → colorA, t=1 → colorB */
function lerpHex(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

interface NeuralGraphProps {
  onNodeSelect?: (memoryId: number) => void;
  selectedNodeId?: number | null;
  viewMode?: ViewMode;
}

export function NeuralGraph({ onNodeSelect, selectedNodeId, viewMode = "hebbian" }: NeuralGraphProps) {
  const { graphData, memories } = useMemory();
  const graphRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const data = useMemo(() => {
    if (graphData.nodes.length === 0 && memories.length > 0) {
      return {
        nodes: memories.map((m) => ({
          id: m.id,
          name: m.summary?.slice(0, 40) || "memory",
          val: Math.max(2, (m.importance || 0.5) * 12),
          color: TYPE_COLORS[m.memory_type] || "#666",
          type: m.memory_type,
          importance: m.importance,
        })),
        links: [],
      };
    }
    return graphData;
  }, [graphData, memories]);

  // Max link value for normalization
  const maxLinkValue = useMemo(() => {
    let max = 1;
    for (const link of data.links) {
      if (link.value > max) max = link.value;
    }
    return max;
  }, [data.links]);

  // Build a node-type lookup for coloring links
  const nodeTypeMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const node of data.nodes) {
      map.set(node.id, node.type);
    }
    return map;
  }, [data.nodes]);

  // Pre-compute connection strengths for selected node
  const connectionMap = useMemo(() => {
    if (!selectedNodeId) return null;
    const map = new Map<number, number>();

    if (viewMode === "hebbian") {
      let maxVal = 1;
      for (const link of data.links) {
        const src = typeof link.source === "object" ? (link.source as any).id : link.source; // eslint-disable-line @typescript-eslint/no-explicit-any
        const tgt = typeof link.target === "object" ? (link.target as any).id : link.target; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (src === selectedNodeId || tgt === selectedNodeId) {
          const otherId = src === selectedNodeId ? tgt : src;
          const val = link.value || 1;
          if (val > maxVal) maxVal = val;
          map.set(otherId, val);
        }
      }
      if (maxVal > 1) {
        for (const [id, val] of map) {
          map.set(id, val / maxVal);
        }
      }
    } else {
      const selected = memories.find((m) => m.id === selectedNodeId);
      if (!selected) return map;
      const selectedTags = new Set([...(selected.tags || []), ...(selected.concepts || [])]);
      const now = Date.now();

      for (const mem of memories) {
        if (mem.id === selectedNodeId) continue;
        const memTags = [...(mem.tags || []), ...(mem.concepts || [])];
        let shared = 0;
        for (const t of memTags) {
          if (selectedTags.has(t)) shared++;
        }
        const relevance = selectedTags.size > 0 ? shared / selectedTags.size : 0;
        const ageMs = now - new Date(mem.created_at).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        const recency = Math.exp(-ageDays * 0.05);
        const decayRate = DECAY_RATES[mem.memory_type] || 0.03;
        const decay = Math.max(0, 1 - decayRate * ageDays);
        const typeBoost = TYPE_BOOSTS[mem.memory_type] || 1.0;
        const score = ((recency * 1 + relevance * 2 + mem.importance * 2) / 5) * decay * typeBoost;
        if (score > 0.01) map.set(mem.id, Math.min(1, score));
      }

      let maxScore = 0;
      for (const val of map.values()) if (val > maxScore) maxScore = val;
      if (maxScore > 0) {
        for (const [id, val] of map) map.set(id, val / maxScore);
      }
    }
    return map;
  }, [selectedNodeId, viewMode, data.links, memories]);

  // Custom Three.js node objects with per-node opacity
  const nodeThreeObject = useCallback(
    (node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const baseSize = Math.cbrt(node.val) * 1.8;
      const typeColor = TYPE_COLORS[node.type as keyof typeof TYPE_COLORS] || "#666";

      if (!selectedNodeId || !connectionMap) {
        // Default state: clean colored sphere
        const geo = new THREE.SphereGeometry(baseSize, 16, 12);
        const mat = new THREE.MeshLambertMaterial({
          color: typeColor,
          transparent: true,
          opacity: 0.85,
        });
        return new THREE.Mesh(geo, mat);
      }

      if (node.id === selectedNodeId) {
        // Selected: bright white core + type-colored glow halo
        const group = new THREE.Group();
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(baseSize * 1.4, 20, 14),
          new THREE.MeshLambertMaterial({ color: "#ffffff", transparent: true, opacity: 1.0 })
        );
        group.add(core);

        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(baseSize * 2.5, 16, 12),
          new THREE.MeshBasicMaterial({ color: typeColor, transparent: true, opacity: 0.12 })
        );
        group.add(halo);
        return group;
      }

      const strength = connectionMap.get(node.id);
      if (strength !== undefined) {
        // Connected: type color with opacity and emissive glow proportional to strength
        const opacity = 0.3 + strength * 0.7;
        const size = baseSize * (0.7 + strength * 0.6);
        const geo = new THREE.SphereGeometry(size, 16, 12);
        const mat = new THREE.MeshLambertMaterial({
          color: typeColor,
          transparent: true,
          opacity,
          emissive: new THREE.Color(typeColor),
          emissiveIntensity: strength * 0.4,
        });
        return new THREE.Mesh(geo, mat);
      }

      // Unrelated: tiny and very dim
      const geo = new THREE.SphereGeometry(baseSize * 0.35, 8, 6);
      const mat = new THREE.MeshLambertMaterial({
        color: "#222222",
        transparent: true,
        opacity: 0.08,
      });
      return new THREE.Mesh(geo, mat);
    },
    [selectedNodeId, connectionMap]
  );

  // Force node object refresh when selection/mode changes (without restarting physics)
  useEffect(() => {
    if (graphRef.current) {
      graphRef.current.refresh();
    }
  }, [selectedNodeId, viewMode]);

  // --- Edge styling: always strength-aware ---

  const getLinkColor = useCallback(
    (link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      const normalizedStrength = (link.value || 1) / maxLinkValue;

      // Get type colors of both endpoints
      const srcType = nodeTypeMap.get(src);
      const tgtType = nodeTypeMap.get(tgt);
      const srcColor = TYPE_COLORS[srcType as keyof typeof TYPE_COLORS] || "#444";
      const tgtColor = TYPE_COLORS[tgtType as keyof typeof TYPE_COLORS] || "#444";
      // Blend the two endpoint colors
      const blended = lerpHex(srcColor, tgtColor, 0.5);

      if (selectedNodeId && connectionMap) {
        // Selection active: highlight connected edges, fade the rest
        if (src === selectedNodeId || tgt === selectedNodeId) {
          const otherId = src === selectedNodeId ? tgt : src;
          const connStrength = connectionMap.get(otherId) ?? 0;
          return dimHex(blended, 0.4 + connStrength * 0.6);
        }
        return "#0a0a0a"; // nearly invisible
      }

      // Default: edge color = blended type colors, dimmed by strength
      return dimHex(blended, 0.15 + normalizedStrength * 0.35);
    },
    [selectedNodeId, connectionMap, maxLinkValue, nodeTypeMap]
  );

  const getLinkWidth = useCallback(
    (link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const normalizedStrength = (link.value || 1) / maxLinkValue;

      if (selectedNodeId && connectionMap) {
        const src = typeof link.source === "object" ? link.source.id : link.source;
        const tgt = typeof link.target === "object" ? link.target.id : link.target;

        if (src === selectedNodeId || tgt === selectedNodeId) {
          const otherId = src === selectedNodeId ? tgt : src;
          const connStrength = connectionMap.get(otherId) ?? 0;
          return 0.8 + connStrength * 4; // 0.8 to 4.8
        }
        return 0.05; // near-invisible
      }

      // Default: width scales with shared tag count
      return 0.2 + normalizedStrength * 1.5;
    },
    [selectedNodeId, connectionMap, maxLinkValue]
  );

  // Directional particles on strong links when selected
  const getLinkParticles = useCallback(
    (link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!selectedNodeId || !connectionMap) return 0;

      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;

      if (src === selectedNodeId || tgt === selectedNodeId) {
        const otherId = src === selectedNodeId ? tgt : src;
        const strength = connectionMap.get(otherId) ?? 0;
        return strength > 0.5 ? 2 : strength > 0.2 ? 1 : 0;
      }
      return 0;
    },
    [selectedNodeId, connectionMap]
  );

  const getLinkParticleColor = useCallback(
    (link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      const otherId = src === selectedNodeId ? tgt : src;
      const otherType = nodeTypeMap.get(otherId);
      return TYPE_COLORS[otherType as keyof typeof TYPE_COLORS] || "#888";
    },
    [selectedNodeId, nodeTypeMap]
  );

  const handleNodeClick = useCallback(
    (node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (graphRef.current) {
        const distance = 80;
        const distRatio =
          1 + distance / Math.hypot(node.x || 0, node.y || 0, node.z || 0);
        graphRef.current.cameraPosition(
          {
            x: (node.x || 0) * distRatio,
            y: (node.y || 0) * distRatio,
            z: (node.z || 0) * distRatio,
          },
          node,
          1000
        );
      }
      onNodeSelect?.(node.id);
    },
    [onNodeSelect]
  );

  if (data.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-600">
        <div className="text-center">
          <p className="text-lg">No memories yet</p>
          <p className="mt-1 text-sm">Chat to create your first memories</p>
        </div>
      </div>
    );
  }

  return (
    <ForceGraph3D
      ref={graphRef}
      graphData={data}
      nodeLabel={(node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const mem = memories.find((m) => m.id === node.id);
        if (!mem) return node.name;

        const strength = connectionMap?.get(node.id);
        const strengthLabel = selectedNodeId && node.id !== selectedNodeId && strength !== undefined
          ? `<div style="color:#aaa;font-size:10px;margin-top:4px">${viewMode} strength: ${Math.round(strength * 100)}%</div>`
          : "";

        return `<div style="background:rgba(10,10,10,0.92);padding:8px 12px;border-radius:8px;border:1px solid ${TYPE_COLORS[mem.memory_type]}33;max-width:250px;backdrop-filter:blur(8px)">
              <div style="color:${TYPE_COLORS[mem.memory_type]};font-size:10px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;font-weight:600">${mem.memory_type.replace("_", " ")}</div>
              <div style="color:#e0e0e0;font-size:12px;line-height:1.4">${mem.summary}</div>
              <div style="color:#666;font-size:10px;margin-top:4px">importance: ${Math.round(mem.importance * 100)}%</div>
              ${strengthLabel}
            </div>`;
      }}
      nodeThreeObject={nodeThreeObject}
      linkColor={getLinkColor}
      linkWidth={getLinkWidth}
      linkOpacity={0.9}
      linkDirectionalParticles={getLinkParticles}
      linkDirectionalParticleSpeed={0.006}
      linkDirectionalParticleWidth={1.5}
      linkDirectionalParticleColor={getLinkParticleColor}
      backgroundColor="#050508"
      onNodeClick={handleNodeClick}
      enableNodeDrag={true}
      warmupTicks={50}
      cooldownTicks={100}
      cooldownTime={3000}
    />
  );
}
