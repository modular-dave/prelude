"use client";

import { Loader2, Check } from "lucide-react";
import { useImport, LOG_PREFIX } from "@/components/shell/use-import";

export function ImportPanel({ onBack }: { onBack: () => void }) {
  const {
    phase, parsed, dateRange, progress, currentDate,
    stats, log, elapsed, errorMsg,
    logRef, fileRef,
    handleFile, handleDrop, handleDragOver,
    startImport, reset, formatDuration,
  } = useImport();

  return (
    <div className="font-mono">
      {phase !== "importing" && (
        <p
          className="text-btn font-mono"
          onClick={onBack}
          style={{ fontSize: "9px", fontWeight: 400, color: "var(--text-faint)", cursor: "pointer" }}
        >
          &larr; settings
        </p>
      )}

      <div className="mt-3">
        <h2
          className="font-mono font-medium"
          style={{ fontSize: "13px", color: "var(--text)" }}
        >
          import
        </h2>
      </div>

      <div className="mt-4">
        {/* IDLE: Drop zone */}
        {phase === "idle" && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 rounded-lg py-12 cursor-pointer hover:opacity-80 transition-opacity"
            style={{ border: "2px dashed var(--border)" }}
          >
            <div className="text-center">
              <p className="font-mono" style={{ fontSize: 11, fontWeight: 400, color: "var(--text)" }}>
                Drop your ChatGPT export here
              </p>
              <p className="font-mono mt-1" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                ZIP or conversations.json from Settings / Data Controls / Export
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".zip,.json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        )}

        {/* PARSING */}
        {phase === "parsing" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--accent)" }} />
            <p className="font-mono" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>Extracting chats...</p>
          </div>
        )}

        {/* CONFIRMING */}
        {phase === "confirming" && (
          <div className="space-y-4">
            <div className="rounded-lg px-4 py-3" style={{ border: "1px solid var(--border)" }}>
              <p className="font-mono" style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>
                Found {parsed.length} chats
              </p>
              {dateRange && (
                <p className="font-mono mt-1" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>
                  {dateRange.from} — {dateRange.to}
                </p>
              )}
              <p className="font-mono mt-2" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                Chats will be imported chronologically with dream and introspection cycles
                simulated during idle periods.
              </p>
            </div>
            <div className="flex gap-2">
              <span
                onClick={reset}
                className="text-btn font-mono"
                style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)", cursor: "pointer" }}
              >
                cancel
              </span>
              <span
                onClick={startImport}
                className="text-btn font-mono"
                style={{ fontSize: 11, fontWeight: 400, color: "var(--accent)", cursor: "pointer" }}
              >
                import
              </span>
            </div>
          </div>
        )}

        {/* IMPORTING */}
        {phase === "importing" && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>
                  {progress.total ? Math.round((progress.current / progress.total) * 100) : 0}% — {progress.current} / {progress.total} chats
                </span>
                {currentDate && (
                  <span className="font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                    {currentDate}
                  </span>
                )}
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
                    background: "var(--accent)",
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "memories", value: stats.memories },
                { label: "dreams", value: stats.dreams },
                { label: "reflections", value: stats.reflections },
                { label: "idle days", value: stats.idleDays },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-md px-2 py-1.5 text-center" style={{ border: "1px solid var(--border)" }}>
                  <div className="font-mono" style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>{value}</div>
                  <div className="font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>{label}</div>
                </div>
              ))}
            </div>

            <div
              ref={logRef}
              className="h-48 overflow-y-auto rounded-md px-3 py-2 space-y-0.5"
              style={{ border: "1px solid var(--border)" }}
            >
              {log.map((entry, i) => (
                <div key={i} className="flex items-start gap-1.5 font-mono" style={{ fontSize: 11, fontWeight: 400, color: entry.type === "error" ? "var(--error)" : "var(--text-muted)" }}>
                  <span style={{ color: "var(--text-faint)", flexShrink: 0 }}>
                    {LOG_PREFIX[entry.type] || entry.type}
                  </span>
                  <span>{entry.text}</span>
                </div>
              ))}
              {log.length === 0 && (
                <div className="flex items-center gap-2 font-mono" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>
                  <Loader2 className="h-3 w-3 animate-spin" /> Starting import...
                </div>
              )}
            </div>
          </div>
        )}

        {/* COMPLETE */}
        {phase === "complete" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2 py-4">
              <Check className="h-4 w-4" style={{ color: "var(--success)" }} />
              <p className="font-mono" style={{ fontSize: 13, fontWeight: 500, color: "var(--success)" }}>Import complete</p>
              <p className="font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
                {formatDuration(elapsed)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "chats", value: stats.conversations },
                { label: "memories", value: stats.memories },
                { label: "dream cycles", value: stats.dreams },
                { label: "reflections", value: stats.reflections },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-md px-3 py-2" style={{ border: "1px solid var(--border)" }}>
                  <div className="font-mono" style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>{value}</div>
                  <div className="font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>{label}</div>
                </div>
              ))}
            </div>

            <span
              onClick={onBack}
              className="text-btn font-mono"
              style={{ fontSize: 11, fontWeight: 400, color: "var(--accent)", cursor: "pointer" }}
            >
              done
            </span>
          </div>
        )}

        {/* ERROR */}
        {phase === "error" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2 py-4">
              <p className="font-mono" style={{ fontSize: 11, fontWeight: 500, color: "var(--error)" }}>Error</p>
              <p className="font-mono text-center" style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>{errorMsg}</p>
            </div>
            <span
              onClick={reset}
              className="text-btn font-mono"
              style={{ fontSize: 11, fontWeight: 400, color: "var(--text)", cursor: "pointer" }}
            >
              try again
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
