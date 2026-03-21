"use client";

import Link from "next/link";
import { Divider } from "@/components/settings/settings-primitives";
import { useSettingsData } from "@/lib/hooks/use-settings-data";

// ── Internal components ──

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="t-micro uppercase" style={{ color: "var(--text-faint)", letterSpacing: "0.05em" }}>
      {children}
    </span>
  );
}

function MenuItem({
  href,
  label,
  badge,
  active,
  onClick,
}: {
  href: string;
  label: string;
  badge?: string | null;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className="rounded-[4px] px-1.5 py-0.5 -mx-1.5 transition"
      style={active ? { background: "var(--surface-dim)" } : undefined}
    >
      <Link
        href={href}
        onClick={onClick}
        className="text-btn hover:underline t-body"
        style={{ color: active ? "var(--accent)" : "var(--text)", textDecoration: "none" }}
      >
        {label}
      </Link>
      {badge && (
        <span className="t-micro" style={{ color: "var(--text-faint)", marginLeft: 6 }}>
          {badge}
        </span>
      )}
    </div>
  );
}

// ── Shared settings menu ──

interface SettingsMenuProps {
  onItemClick?: () => void;
  currentPath?: string;
}

export function SettingsMenu({ onItemClick, currentPath }: SettingsMenuProps) {
  const { activeModelDisplay, cortexSummary } = useSettingsData();

  return (
    <div className="space-y-2">
      {/* ── Config ── */}
      <SectionLabel>config</SectionLabel>
      <MenuItem href="/settings/storage" label="storage" badge={cortexSummary} active={currentPath === "/settings/storage"} onClick={onItemClick} />
      <MenuItem href="/settings/inference" label="inference" badge={activeModelDisplay || "no model"} active={currentPath === "/settings/inference"} onClick={onItemClick} />
      <MenuItem href="/settings/embedding" label="embedding" badge="models & slots" active={currentPath === "/settings/embedding"} onClick={onItemClick} />

      <Divider />

      {/* ── Cortex ── */}
      <SectionLabel>cortex</SectionLabel>
      <MenuItem href="/settings/prompts" label="prompts" badge="persona & instructions" active={currentPath === "/settings/prompts"} onClick={onItemClick} />
      <MenuItem href="/settings/retrieval" label="retrieval" badge="scoring & boosts" active={currentPath === "/settings/retrieval"} onClick={onItemClick} />
      <MenuItem href="/settings/reinforcement" label="reinforcement" badge="decay & cycles" active={currentPath === "/settings/reinforcement"} onClick={onItemClick} />
      <MenuItem href="/settings/cognition" label="cognition" badge="self & governance" active={currentPath === "/settings/cognition"} onClick={onItemClick} />

      <Divider />

      {/* ── World ── */}
      <SectionLabel>world</SectionLabel>
      <MenuItem href="/settings/chat" label="chat" badge="behavior & search" active={currentPath === "/settings/chat"} onClick={onItemClick} />
      <MenuItem href="/settings/data" label="data" badge="upload & packs" active={currentPath === "/settings/data"} onClick={onItemClick} />
      <MenuItem href="/settings/stats" label="stats" badge="analytics" active={currentPath === "/settings/stats"} onClick={onItemClick} />
    </div>
  );
}
