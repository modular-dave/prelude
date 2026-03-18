import { TYPE_COLORS } from "@/lib/types";

interface PinnedContent {
  type: "memory" | "entity";
  name: string;
  memoryType: string;
  importance: number;
  accessCount: number;
  linkCount: number;
  decayFactor: number;
}

export function PinnedCardBody({ content }: { content: PinnedContent }) {
  const dim = { color: "rgba(0,0,0,0.35)", fontSize: 8 } as const;
  const val = { color: "rgba(0,0,0,0.6)", fontSize: 8 } as const;
  const typeColor = TYPE_COLORS[content.memoryType as keyof typeof TYPE_COLORS] || "rgba(0,0,0,0.4)";

  const decayPct = Math.round(content.decayFactor * 100);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: typeColor, flexShrink: 0 }} />
        <span style={{ color: "rgba(0,0,0,0.4)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.01em" }}>
          {content.memoryType.replace("_", " ")}
        </span>
      </div>
      <div style={{ color: "rgba(0,0,0,0.8)", fontSize: 10, lineHeight: 1.4, marginBottom: 6 }}>
        {content.name}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={dim}>reinforced</span><span style={val}>{content.linkCount} links</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={dim}>retrieved</span><span style={val}>{content.accessCount} times</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={dim}>importance</span><span style={val}>{Math.round(content.importance * 100)}%</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={dim}>decay</span>
          <span style={{
            ...val,
            color: decayPct > 80 ? "rgba(0,120,0,0.6)" : decayPct > 40 ? "rgba(180,120,0,0.7)" : "rgba(180,0,0,0.6)",
          }}>
            {decayPct}%
          </span>
        </div>
      </div>
    </>
  );
}
