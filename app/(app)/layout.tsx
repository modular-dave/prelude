"use client";

import { MemoryProvider } from "@/lib/memory-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MemoryProvider>
      <div className="h-dvh overflow-hidden" style={{ background: "var(--bg)" }}>{children}</div>
    </MemoryProvider>
  );
}
