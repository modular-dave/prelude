"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FloatNav } from "@/components/shell/float-nav";
import { SettingsMenu } from "@/components/settings/settings-menu";

interface SettingsPageLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export function SettingsPageLayout({ title, subtitle, children }: SettingsPageLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="relative h-full overflow-hidden font-mono" style={{ background: "var(--bg)" }}>
      <FloatNav route="settings" />
      <div className="flex h-full pt-14">
        {/* ── Sidebar ── */}
        <aside
          className="w-48 shrink-0 overflow-y-auto p-4"
          style={{ borderRight: "1px solid var(--border)" }}
        >
          <SettingsMenu currentPath={pathname} />
          <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            <Link href="/" className="text-btn t-small" style={{ color: "var(--text-faint)", textDecoration: "none" }}>
              × close
            </Link>
          </div>
        </aside>

        {/* ── Content ── */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="animate-fade-slide-up max-w-xl">
            <span className="t-title" style={{ color: "var(--text)" }}>{title}</span>
            <p className="mt-1 t-tiny" style={{ color: "var(--text-faint)" }}>{subtitle}</p>
            <div className="mt-6 space-y-1">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
