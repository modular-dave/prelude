"use client";

import { CortexContent } from "@/components/cortex/cortex-content";
import { FloatNav } from "@/components/shell/float-nav";

export default function CortexPage() {
  return (
    <div className="relative h-full overflow-y-auto p-6 pt-20 font-mono" style={{ background: "var(--bg)" }}>
      <FloatNav route="brain" />
      <CortexContent variant="page" />
    </div>
  );
}
