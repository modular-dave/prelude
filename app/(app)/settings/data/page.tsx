"use client";

import { useState, useRef } from "react";
import { Loader2, Download, Upload } from "lucide-react";
import { SettingsPageLayout } from "@/components/settings/settings-page-layout";

interface MemoryPack {
  name: string;
  description: string;
  version: string;
  exportedAt: string;
  memories: Array<{
    type: string;
    content: string;
    summary: string;
    tags: string[];
    importance: number;
    concepts: string[];
    emotional_valence: number;
  }>;
}

interface PackHistory {
  name: string;
  memoryCount: number;
  exportedAt: string;
  pack: MemoryPack;
}

export default function PacksPage() {
  // Export state
  const [exportName, setExportName] = useState("");
  const [exportDesc, setExportDesc] = useState("");
  const [exportSource, setExportSource] = useState<"all" | "type" | "query">("all");
  const [exportTypes, setExportTypes] = useState<string[]>([]);
  const [exportQuery, setExportQuery] = useState("");
  const [exportLimit, setExportLimit] = useState(100);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Import state
  const [importPack, setImportPack] = useState<MemoryPack | null>(null);
  const [importMultiplier, setImportMultiplier] = useState(0.8);
  const [importPrefix, setImportPrefix] = useState("imported-");
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // History
  const [packHistory, setPackHistory] = useState<PackHistory[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("prelude:pack-history") || "[]");
    } catch { return []; }
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveHistory = (history: PackHistory[]) => {
    setPackHistory(history);
    try { localStorage.setItem("prelude:pack-history", JSON.stringify(history.slice(0, 20))); } catch {}
  };

  const handleExport = async (format: "json" | "markdown" = "json") => {
    setExporting(true);
    setExportError(null);
    try {
      const autoName = exportSource === "type" && exportTypes.length > 0
        ? `${exportTypes.join("+")} pack`
        : exportSource === "query" && exportQuery
          ? `"${exportQuery}" pack`
          : `${new Date().toLocaleDateString([], { month: "short", day: "numeric" })} export`;
      const body: any = {
        action: format === "markdown" ? "markdown" : "export",
        name: exportName || autoName,
        description: exportDesc,
        limit: exportLimit,
      };
      if (exportSource === "type" && exportTypes.length > 0) body.types = exportTypes;
      if (exportSource === "query" && exportQuery) body.query = exportQuery;

      const res = await fetch("/api/cortex/packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (format === "markdown") {
        const text = await res.text();
        const blob = new Blob([text], { type: "text/markdown" });
        downloadBlob(blob, `${exportName || "pack"}.md`);
      } else {
        const pack = await res.json() as MemoryPack;
        const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
        downloadBlob(blob, `${exportName || "pack"}.json`);

        // Save to history
        saveHistory([{ name: pack.name, memoryCount: pack.memories.length, exportedAt: pack.exportedAt, pack }, ...packHistory]);
      }
    } catch (err) {
      setExportError(String(err));
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const pack = JSON.parse(text) as MemoryPack;
      setImportPack(pack);
      setImportResult(null);
      setImportError(null);

      // Get preview
      const res = await fetch("/api/cortex/packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", pack }),
      });
      setImportPreview(await res.json());
    } catch (err) {
      setImportError("Invalid pack file: " + String(err));
    }
  };

  const handleImport = async () => {
    if (!importPack) return;
    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch("/api/cortex/packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import",
          pack: importPack,
          importanceMultiplier: importMultiplier,
          tagPrefix: importPrefix,
        }),
      });
      const result = await res.json();
      setImportResult(result);
    } catch (err) {
      setImportError(String(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <SettingsPageLayout title="data" subtitle="export, import & memory packs">
      {/* ── Export ── */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <div className="flex items-center gap-2 mb-3">
          <Download className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
          <span className="t-body" style={{ color: "var(--text)" }}>Export New Pack</span>
        </div>

        <div className="space-y-2">
          <input
            type="text" value={exportName} onChange={(e) => setExportName(e.target.value)}
            placeholder="Pack name..." className="w-full rounded-[4px] px-2 py-1.5 t-small outline-none"
            style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}
          />
          <input
            type="text" value={exportDesc} onChange={(e) => setExportDesc(e.target.value)}
            placeholder="Description..." className="w-full rounded-[4px] px-2 py-1.5 t-small outline-none"
            style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}
          />

          <div className="flex items-center gap-3">
            <span className="t-small" style={{ color: "var(--text-muted)" }}>Source:</span>
            {(["all", "type", "query"] as const).map((s) => (
              <label key={s} className="flex items-center gap-1 cursor-pointer">
                <input type="radio" name="source" checked={exportSource === s} onChange={() => setExportSource(s)} />
                <span className="t-small" style={{ color: "var(--text)" }}>{s}</span>
              </label>
            ))}
          </div>

          {exportSource === "type" && (
            <div className="flex gap-2 flex-wrap">
              {["episodic", "semantic", "procedural", "self_model", "introspective"].map((t) => (
                <label key={t} className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={exportTypes.includes(t)}
                    onChange={(e) => setExportTypes(e.target.checked ? [...exportTypes, t] : exportTypes.filter((x) => x !== t))} />
                  <span className="t-small" style={{ color: "var(--text-muted)" }}>{t}</span>
                </label>
              ))}
            </div>
          )}

          {exportSource === "query" && (
            <input type="text" value={exportQuery} onChange={(e) => setExportQuery(e.target.value)}
              placeholder="Search query..." className="w-full rounded-[4px] px-2 py-1.5 t-small outline-none"
              style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}
            />
          )}

          <div className="flex items-center gap-2">
            <span className="t-small" style={{ color: "var(--text-muted)" }}>Limit:</span>
            <input type="number" value={exportLimit} onChange={(e) => setExportLimit(Number(e.target.value))}
              className="w-20 rounded-[4px] px-2 py-1 t-small outline-none"
              style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}
            />
          </div>

          <div className="flex gap-2">
            <button onClick={() => handleExport("json")} disabled={exporting}
              className="text-btn t-btn transition active:scale-95 disabled:opacity-40"
              style={{ color: "var(--accent)" }}
            >
              {exporting ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "Export JSON"}
            </button>
            <button onClick={() => handleExport("markdown")} disabled={exporting}
              className="text-btn t-btn transition active:scale-95 disabled:opacity-40"
              style={{ color: "var(--text-muted)" }}
            >
              Export Markdown
            </button>
          </div>

          {exportError && <p className="t-small" style={{ color: "var(--error)" }}>{exportError}</p>}
        </div>
      </div>

      {/* ── Import ── */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <div className="flex items-center gap-2 mb-3">
          <Upload className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
          <span className="t-body" style={{ color: "var(--text)" }}>Import Pack</span>
        </div>

        <input type="file" ref={fileInputRef} accept=".json" onChange={handleFileSelect} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="rounded-[4px] px-3 py-2 t-small transition active:scale-95"
          style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px dashed var(--border)" }}
        >
          Select .json file
        </button>

        {importPreview && importPack && (
          <div className="mt-3 space-y-2">
            <div className="rounded-[4px] p-3" style={{ background: "var(--surface-dimmer)" }}>
              <p className="t-small" style={{ color: "var(--text)" }}>
                {importPack.name} — {importPreview.memoryCount} memories
              </p>
              <div className="mt-1 flex gap-2 flex-wrap">
                {Object.entries(importPreview.types || {}).map(([type, count]) => (
                  <span key={type} className="t-micro" style={{ color: "var(--text-muted)" }}>
                    {type} ({count as number})
                    {type === "self_model" && <span className="text-amber-500 ml-1">⚠ private</span>}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="t-small" style={{ color: "var(--text-muted)" }}>Importance ×</span>
              <input type="number" step="0.1" value={importMultiplier}
                onChange={(e) => setImportMultiplier(Number(e.target.value))}
                className="w-16 rounded-[4px] px-2 py-1 t-small outline-none"
                style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}
              />
              <span className="t-small" style={{ color: "var(--text-muted)" }}>Tag prefix:</span>
              <input type="text" value={importPrefix} onChange={(e) => setImportPrefix(e.target.value)}
                className="w-24 rounded-[4px] px-2 py-1 t-small outline-none"
                style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}
              />
            </div>

            <button onClick={handleImport} disabled={importing}
              className="text-btn t-btn transition active:scale-95 disabled:opacity-40"
              style={{ color: "var(--accent)" }}
            >
              {importing ? <Loader2 className="h-3 w-3 animate-spin inline" /> : `Import ${importPreview.memoryCount} Memories`}
            </button>

            {importResult && (
              <p className="t-small" style={{ color: "var(--success)" }}>
                Imported {importResult.imported}, skipped {importResult.skipped}
              </p>
            )}
            {importError && <p className="t-small" style={{ color: "var(--error)" }}>{importError}</p>}
          </div>
        )}
      </div>

      {/* ── History ── */}
      {packHistory.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <span className="t-tiny" style={{ color: "var(--text-faint)" }}>
            Pack History ({packHistory.length})
          </span>
          <div className="mt-2 space-y-1.5">
            {packHistory.map((h, i) => {
              const d = new Date(h.exportedAt);
              const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
              // Summarize types from pack data
              const typeCounts: Record<string, number> = {};
              for (const m of h.pack?.memories || []) {
                typeCounts[m.type] = (typeCounts[m.type] || 0) + 1;
              }
              const typeStr = Object.entries(typeCounts).map(([t, c]) => `${t} ${c}`).join(" · ");

              return (
                <div key={i} className="rounded-[4px] px-2.5 py-2"
                  style={{ background: "var(--surface-dimmer)" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1 t-small" style={{ color: "var(--text)" }}>
                      {h.name}
                    </span>
                    <span className="t-micro" style={{ color: "var(--text-faint)" }}>
                      {h.memoryCount} memories
                    </span>
                    <span className="t-micro" style={{ color: "var(--text-faint)" }}>
                      {date} {time}
                    </span>
                    <button
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(h.pack, null, 2)], { type: "application/json" });
                        downloadBlob(blob, `${h.name}.json`);
                      }}
                      className="t-micro transition active:scale-95"
                      style={{ color: "var(--accent)" }}
                    >
                      re-export
                    </button>
                  </div>
                  {typeStr && (
                    <p className="t-micro mt-0.5" style={{ color: "var(--text-faint)" }}>
                      {typeStr}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </SettingsPageLayout>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
