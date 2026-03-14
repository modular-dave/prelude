"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronUp, ChevronDown, Settings, Moon } from "lucide-react";
import { SettingsSheet } from "@/components/shell/settings-sheet";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Logo } from "@/components/ui/logo";

type Route = "chat" | "brain" | "dreams";

export function FloatNav({ route }: { route: Route }) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-40">
        {/* Top left: Logo (all routes) */}
        <div className="absolute top-5 left-5 pointer-events-auto">
          <Link href="/" style={{ textDecoration: "none" }}>
            <Logo />
          </Link>
        </div>

        {/* Top right: Theme + Settings */}
        <div className="absolute top-4 right-4 pointer-events-auto flex items-center gap-2">
          {/* Dreams button on brain page — top right */}
          {route === "brain" && (
            <Link
              href="/dreams"
              className="flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-xs transition-all duration-200 glass active:scale-95"
              style={{ minHeight: 36, color: "var(--text-muted)" }}
            >
              <Moon className="h-3.5 w-3.5" />
              Dreams
            </Link>
          )}
          <ThemeToggle />
          {route === "chat" && (
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-[8px] transition-all duration-200 glass active:scale-95"
              style={{ color: "var(--text-muted)" }}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Chat page: Brain button top center */}
        {route === "chat" && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-auto">
            <Link
              href="/brain"
              className="flex items-center gap-1.5 rounded-[8px] px-4 py-2 text-xs transition-all duration-200 glass active:scale-95"
              style={{ minHeight: 36, color: "var(--text-muted)" }}
            >
              <ChevronUp className="h-3.5 w-3.5" />
              Brain
            </Link>
          </div>
        )}

        {/* Brain page: Chat button bottom center */}
        {route === "brain" && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-[8px] px-4 py-2 text-xs transition-all duration-200 glass active:scale-95"
              style={{ minHeight: 36, color: "var(--text-muted)" }}
            >
              <ChevronDown className="h-3.5 w-3.5" />
              Chat
            </Link>
          </div>
        )}

        {/* Dreams page: Brain button top center */}
        {route === "dreams" && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-auto">
            <Link
              href="/brain"
              className="flex items-center gap-1.5 rounded-[8px] px-4 py-2 text-xs transition-all duration-200 glass active:scale-95"
              style={{ minHeight: 36, color: "var(--text-muted)" }}
            >
              <ChevronUp className="h-3.5 w-3.5" />
              Brain
            </Link>
          </div>
        )}
      </div>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
