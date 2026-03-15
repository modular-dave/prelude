"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BrainView } from "@/components/brain/brain-view";
import { FloatNav } from "@/components/shell/float-nav";

function BrainEdgeInner() {
  const params = useSearchParams();
  const sourceId = params.get("source");
  const targetId = params.get("target");
  const linkType = params.get("type") || "reinforced";
  const strength = parseFloat(params.get("strength") || "0.5");

  const sourceNum = sourceId ? parseInt(sourceId, 10) : NaN;
  const targetNum = targetId ? parseInt(targetId, 10) : NaN;

  const initialEdge =
    !isNaN(sourceNum) && !isNaN(targetNum)
      ? {
          sourceId: `m_${sourceNum}`,
          targetId: `m_${targetNum}`,
          sourceNumericId: sourceNum,
          targetNumericId: targetNum,
          linkType,
          strength,
        }
      : null;

  return (
    <div className="relative h-full">
      <BrainView initialEdge={initialEdge} />
      <FloatNav route="brain" />
    </div>
  );
}

export default function BrainEdgePage() {
  return (
    <Suspense>
      <BrainEdgeInner />
    </Suspense>
  );
}
