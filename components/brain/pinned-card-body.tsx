import { TYPE_COLORS, LINK_TYPE_COLORS, LINK_TYPE_LABELS } from "@/lib/types";
import { ENTITY_COLORS, DEFAULT_ENTITY_COLOR } from "@/lib/3d-graph/constants";
import type { SelectedEdgeInfo } from "./neural-graph";

export function PinnedCardBody({ content, onOpenMemory, onOpenEdge, onClose }: { content: any; onOpenMemory?: (id: number) => void; onOpenEdge?: (edge: SelectedEdgeInfo) => void; onClose: () => void }) {
  const dim = { color: "rgba(0,0,0,0.35)", fontSize: 8 };
  const val = { color: "rgba(0,0,0,0.6)", fontSize: 8 };
  const title = { color: "rgba(0,0,0,0.25)", fontSize: 7, textTransform: "uppercase" as const, letterSpacing: "0.01em", marginBottom: 5 };
  const closeBtn = (
    <button
      onClick={onClose}
      style={{ position: "absolute", top: 4, right: 6, background: "none", border: "none", cursor: "pointer", color: "rgba(0,0,0,0.3)", fontSize: 12, lineHeight: 1, padding: 2, fontFamily: "inherit" }}
      title="Close"
    >
      ×
    </button>
  );

  if (content.type === "entity") {
    return (
      <>
        {closeBtn}
        <div style={title}>Entity</div>
        <div style={{ color: ENTITY_COLORS[content.node.type] || DEFAULT_ENTITY_COLOR, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.01em", fontWeight: 500 }}>entity · {content.node.type}</div>
        <div style={{ color: "rgba(0,0,0,0.75)", fontSize: 10, marginTop: 3, lineHeight: 1.4 }}>{content.node.name}</div>
      </>
    );
  }

  if (content.type === "memory") {
    const { mem, linkCount } = content;
    return (
      <>
        {closeBtn}
        <div style={title}>Memory</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: TYPE_COLORS[mem.memory_type], flexShrink: 0 }} />
          <span style={{ color: "rgba(0,0,0,0.4)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.01em" }}>{mem.memory_type.replace("_", " ")}</span>
        </div>
        <div style={{ color: "rgba(0,0,0,0.8)", fontSize: 10, lineHeight: 1.4, marginBottom: 6 }}>{mem.summary}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={dim}>recalls</span><span style={val}>{mem.access_count ?? 0}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={dim}>links</span><span style={val}>{linkCount}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={dim}>importance</span><span style={val}>{Math.round(mem.importance * 100)}%</span></div>
        </div>
        <button
          onClick={() => { if (mem.id != null) onOpenMemory?.(mem.id); }}
          style={{ marginTop: 6, width: "100%", padding: "3px 0", borderRadius: 4, border: "1px solid rgba(0,0,0,0.08)", background: "transparent", color: "var(--accent)", fontSize: 8, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.01em" }}
        >
          Open Memory
        </button>
      </>
    );
  }

  if (content.type === "edge") {
    const { link, src, tgt } = content;
    const linkType = link.linkType || "relates";
    const color = LINK_TYPE_COLORS[linkType] || "#6b7280";
    const label = LINK_TYPE_LABELS[linkType] || linkType;
    const weight = typeof link.value === "number" ? Math.round(link.value * 100) : "—";
    return (
      <>
        {closeBtn}
        <div style={title}>Edge</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <div style={{ width: 8, height: 3, borderRadius: 1, background: color, flexShrink: 0 }} />
          <span style={{ color, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.01em", fontWeight: 500 }}>{label}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={dim}>from</span><span style={{ ...val, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src?.name || "?"}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={dim}>to</span><span style={{ ...val, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tgt?.name || "?"}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={dim}>weight</span><span style={val}>{weight}%</span></div>
        </div>
        <button
          onClick={() => {
            if (src && tgt) {
              onOpenEdge?.({
                sourceId: src.id,
                targetId: tgt.id,
                sourceNumericId: src.numericId,
                targetNumericId: tgt.numericId,
                linkType,
                strength: typeof link.value === "number" ? link.value : 0,
              });
            }
          }}
          style={{ marginTop: 6, width: "100%", padding: "3px 0", borderRadius: 4, border: "1px solid rgba(0,0,0,0.08)", background: "transparent", color: "var(--accent)", fontSize: 8, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.01em" }}
        >
          Open Path
        </button>
      </>
    );
  }

  return null;
}
