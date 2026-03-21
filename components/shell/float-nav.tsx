"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { Logo } from "@/components/ui/logo";

type Route = "chat" | "brain" | "dreams" | "journal" | "packs" | "history" | "stats" | "settings";

const NAV_ITEMS: { label: string; href: string; route: Route }[] = [
  { label: "journal", href: "/journal", route: "journal" },
  { label: "dreams", href: "/dreams", route: "dreams" },
];

export function FloatNav({ route }: { route: Route }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      {/* Top left: Logo */}
      <div className="absolute top-5 left-5 pointer-events-auto">
        {route === "brain" ? (
          <a href="/" style={{ textDecoration: "none" }}>
            <Logo />
          </a>
        ) : (
          <Link href="/" style={{ textDecoration: "none" }}>
            <Logo />
          </Link>
        )}
      </div>

      {/* Top center: Navigation */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 pointer-events-auto">
        <div className="flex items-center gap-2 t-body">
          {NAV_ITEMS.map((item, i) => {
            const isActive = item.route === route;
            const needsHardNav = route === "brain";
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

      {/* Top right: Settings — always navigates to /settings */}
      <div className="absolute top-5 right-5 pointer-events-auto">
        {route === "brain" ? (
          <a
            href="/settings"
            className="transition active:scale-95 block"
            style={{ color: "var(--text-faint)" }}
          >
            <Settings className="h-4 w-4" />
          </a>
        ) : (
          <Link
            href="/settings"
            className="transition active:scale-95 block"
            style={{ color: "var(--text-faint)" }}
          >
            <Settings className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
