"use client";

import { useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { SettingsSheet } from "@/components/shell/settings-sheet";
import { Logo } from "@/components/ui/logo";

type Route = "chat" | "brain" | "dreams" | "journal" | "history" | "stats";

const NAV_ITEMS: { label: string; href: string; route: Route }[] = [
  { label: "Journal", href: "/journal", route: "journal" },
  { label: "Dreams", href: "/dreams", route: "dreams" },
  { label: "Brain", href: "/brain", route: "brain" },
];

export function FloatNav({ route }: { route: Route }) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-40">
        {/* Top left: Logo */}
        <div className="absolute top-5 left-5 pointer-events-auto">
          <a href="/brain" style={{ textDecoration: "none" }}>
            <Logo />
          </a>
        </div>

        {/* Top center: Navigation pill bar */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-auto">
          <div className="flex items-center gap-0.5 rounded-[10px] p-1 glass">
            {NAV_ITEMS.map((item) => {
              const isActive = item.route === route;
              // Chat: hard nav ensures fresh new-chat state every time
              // Brain: WebGL (Three.js) doesn't survive SPA remounts
              const needsHardNav = item.route === "chat" || item.route === "brain" || route === "brain";
              const NavTag = needsHardNav ? "a" : Link;
              return (
                <NavTag
                  key={item.route}
                  href={item.href}
                  className="rounded-[7px] px-4 py-1.5 t-btn transition-all duration-200 active:scale-95"
                  style={{
                    color: isActive ? "var(--accent)" : "var(--text-faint)",
                    background: isActive ? "var(--surface-dim)" : "transparent",
                    textDecoration: "none",
                  }}
                >
                  {item.label}
                </NavTag>
              );
            })}
          </div>
        </div>

        {/* Top right: Settings */}
        <div className="absolute top-4 right-4 pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-[8px] transition-all duration-200 glass active:scale-95"
            style={{ color: "var(--text-muted)" }}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
