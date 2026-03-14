"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, MessageCircle, Database, Moon, BarChart3 } from "lucide-react";
import { useMemory } from "@/lib/memory-context";
import { PulseOrb } from "@/components/ui/pulse-orb";
import { TYPE_COLORS } from "@/lib/types";

const NAV_ITEMS = [
  { href: "/", icon: Brain, label: "Neural Map", color: "#6366f1" },
  { href: "/chat", icon: MessageCircle, label: "Interface", color: "#60a5fa" },
  { href: "/memories", icon: Database, label: "Memory Bank", color: "#8b5cf6" },
  { href: "/dreams", icon: Moon, label: "Dream Cycle", color: "#a78bfa" },
  { href: "/stats", icon: BarChart3, label: "Telemetry", color: "#22d3ee" },
];

export function DashboardNav() {
  const pathname = usePathname();
  const { memories } = useMemory();

  const typeCounts = memories.reduce(
    (acc, m) => {
      acc[m.memory_type] = (acc[m.memory_type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <nav className="flex w-16 flex-col items-center bg-[#06060e] py-4 lg:w-56"
      style={{ borderRight: "1px solid rgba(99, 102, 241, 0.08)" }}>

      {/* Logo */}
      <div className="mb-10 flex items-center gap-3 px-4">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
          <Brain className="h-4.5 w-4.5 text-white" />
          <div className="absolute -inset-0.5 rounded-xl opacity-30 blur-sm"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }} />
        </div>
        <div className="hidden lg:block">
          <span className="text-sm font-semibold tracking-wide text-white">PRELUDE</span>
          <p className="text-[9px] uppercase tracking-[0.2em] text-indigo-400/50">neural core</p>
        </div>
      </div>

      {/* Nav items */}
      <div className="flex flex-1 flex-col gap-0.5 px-2 w-full">
        {NAV_ITEMS.map(({ href, icon: Icon, label, color }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-200 ${
                isActive
                  ? "text-white"
                  : "text-neutral-500 hover:text-neutral-200"
              }`}
              style={isActive ? {
                background: `linear-gradient(90deg, ${color}15, transparent)`,
              } : {}}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r"
                  style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
              )}

              <Icon className="h-4 w-4 shrink-0 transition-colors"
                style={isActive ? { color } : {}} />
              <span className="hidden lg:block">{label}</span>
            </Link>
          );
        })}
      </div>

      {/* Memory type indicator dots */}
      <div className="mb-4 hidden px-4 lg:block">
        <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.02)" }}>
          <p className="mb-2 text-[8px] uppercase tracking-[0.15em] text-neutral-600">active types</p>
          <div className="flex flex-col gap-1.5">
            {(Object.entries(TYPE_COLORS) as [string, string][]).map(([type, color]) => (
              <div key={type} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}40` }} />
                  <span className="text-[9px] text-neutral-600">{type.replace("_", " ")}</span>
                </div>
                <span className="text-[9px] font-medium" style={{ color }}>{typeCounts[type] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 px-3 py-2">
        <PulseOrb color="#22c55e" size={5} />
        <span className="hidden text-[10px] font-medium tracking-wide text-neutral-600 lg:block">
          {memories.length} NODES
        </span>
      </div>
    </nav>
  );
}
