"use client";

import { useEffect, useRef, useState } from "react";
import { X, ChevronDown, ChevronRight, BarChart3, Database } from "lucide-react";
import { StatsGrid } from "@/components/stats/stats-grid";
import { TypeDistribution } from "@/components/stats/type-distribution";
import { TagCloud } from "@/components/stats/tag-cloud";
import { IntrospectionPanel } from "@/components/brain/introspection-panel";
import { MemoryTypeCards } from "@/components/memory/memory-type-cards";
import { MemoryTimeline } from "@/components/memory/memory-timeline";

export function SettingsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [dashboardOpen, setDashboardOpen] = useState(true);
  const [memoryBankOpen, setMemoryBankOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        ref={backdropRef}
        className="absolute inset-0 animate-fade-in"
        style={{ background: "rgba(0,0,0,0.15)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />

      <div className="relative z-10 w-full sm:w-96 h-full overflow-y-auto glass-panel animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 glass">
          <h2 className="heading">Settings</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] transition"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {/* Dashboard */}
          <button
            onClick={() => setDashboardOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left text-xs transition"
            style={{ color: "var(--text-muted)" }}
          >
            <BarChart3 className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
            <span className="flex-1 font-medium">Dashboard</span>
            {dashboardOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {dashboardOpen && (
            <div className="space-y-4 px-1 pb-2 animate-fade-slide-up">
              <StatsGrid />
              <div>
                <h4 className="label mb-2">Type Distribution</h4>
                <TypeDistribution />
              </div>
              <div>
                <h4 className="label mb-2">Tag Cloud</h4>
                <TagCloud />
              </div>
              <IntrospectionPanel />
            </div>
          )}

          {/* Memory Bank */}
          <button
            onClick={() => setMemoryBankOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left text-xs transition"
            style={{ color: "var(--text-muted)" }}
          >
            <Database className="h-3.5 w-3.5" style={{ color: "var(--self-model)" }} />
            <span className="flex-1 font-medium">Memory Bank</span>
            {memoryBankOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {memoryBankOpen && (
            <div className="space-y-4 px-1 pb-2 animate-fade-slide-up">
              <MemoryTypeCards />
              <div>
                <h4 className="label mb-2">Timeline</h4>
                <MemoryTimeline />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
