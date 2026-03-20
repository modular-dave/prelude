"use client";

import { useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { SettingsSheet } from "@/components/shell/settings-sheet";
import { Logo } from "@/components/ui/logo";

type Route = "chat" | "brain" | "dreams" | "journal" | "packs" | "history" | "stats";

const NAV_ITEMS: { label: string; href: string; route: Route }[] = [
  { label: "journal", href: "/journal", route: "journal" },
  { label: "dreams", href: "/dreams", route: "dreams" },
  { label: "packs", href: "/packs", route: "packs" },
];

export function FloatNav({ route, onSettingsClick }: { route: Route; onSettingsClick?: () => void }) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-40">
        {/* Top left: Logo */}
        <div className="absolute top-5 left-5 pointer-events-auto">
          <a href="/" style={{ textDecoration: "none" }}>
            <Logo />
          </a>
        </div>

        {/* Top center: Navigation */}
        <div className="absolute top-5 left-1/2 -translate-x-1/2 pointer-events-auto">
          <div className="flex items-center gap-2" style={{ fontSize: "11px", fontWeight: 400 }}>
            {NAV_ITEMS.map((item, i) => {
              const isActive = item.route === route;
              const needsHardNav = item.route === "chat" || route === "brain";
              const NavTag = needsHardNav ? "a" : Link;
              return (
                <span key={item.route} className="flex items-center gap-2">
                  {i > 0 && <span style={{ color: "var(--text-faint)", opacity: 0.3 }}>︱</span>}
                  <NavTag
                    href={item.href}
                    className="text-btn transition active:scale-95"
                    style={{
                      color: isActive ? "var(--accent)" : "var(--text-faint)",
                    }}
                  >
                    {item.label}
                  </NavTag>
                </span>
              );
            })}
          </div>
        </div>

        {/* Top right: Settings */}
        <div className="absolute top-5 right-5 pointer-events-auto">
          <button
            onClick={() => onSettingsClick ? onSettingsClick() : setSettingsOpen(true)}
            className="transition active:scale-95"
            style={{ color: "var(--text-faint)" }}
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Only render sheet if no external handler (non-brain pages) */}
      {!onSettingsClick && (
        <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      )}
    </>
  );
}
