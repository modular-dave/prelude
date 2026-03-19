"use client";

import { CortexContent } from "@/components/cortex/cortex-content";

export function CortexPanel({ onBack }: { onBack: () => void }) {
  return <CortexContent variant="panel" onBack={onBack} />;
}
