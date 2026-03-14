import { BrainView } from "@/components/brain/brain-view";
import { FloatNav } from "@/components/shell/float-nav";

export default function BrainPage() {
  return (
    <div className="relative h-full">
      <BrainView />
      <FloatNav route="brain" />
    </div>
  );
}
