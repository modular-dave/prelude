"use client";

import { MemoryProvider } from "@/lib/memory-context";
import { DashboardNav } from "@/components/shell/dashboard-nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MemoryProvider>
      <div className="flex h-screen">
        <DashboardNav />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </MemoryProvider>
  );
}
