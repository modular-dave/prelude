"use client";

import { useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { SettingsSheet } from "@/components/shell/settings-sheet";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Logo } from "@/components/ui/logo";

type Route = "chat" | "brain" | "dreams";

const NAV_ITEMS: { label: string; href: string; route: Route }[] = [
  { label: "Chat", href: "/", route: "chat" },
  { label: "Brain", href: "/brain", route: "brain" },
  { label: "Dreams", href: "/dreams", route: "dreams" },
];

export function FloatNav({ route }: { route: Route }) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-40">
        {/* Top left: Logo */}
        <div className="absolute top-5 left-5 pointer-events-auto">
          <Link href="/" style={{ textDecoration: "none" }}>
            <Logo />
          </Link>
        </div>

        {/* Top center: Navigation pill bar */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-auto">
          <div className="flex items-center gap-0.5 rounded-[10px] p-1 glass">
            {NAV_ITEMS.map((item) => {
              const isActive = item.route === route;
              return (
                <Link
                  key={item.route}
                  href={item.href}
                  className="rounded-[7px] px-4 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95"
                  style={{
                    color: isActive ? "var(--accent)" : "var(--text-faint)",
                    background: isActive ? "var(--surface-dim)" : "transparent",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Top right: Theme + Settings */}
        <div className="absolute top-4 right-4 pointer-events-auto flex items-center gap-2">
          <ThemeToggle />
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
