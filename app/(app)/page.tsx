import { redirect } from "next/navigation";
import { BrainView } from "@/components/brain/brain-view";

export default function RootPage() {
  if (process.env.PRELUDE_SETUP_COMPLETE !== "true") {
    redirect("/setup");
  }

  return (
    <div className="relative h-full">
      <BrainView />
    </div>
  );
}
