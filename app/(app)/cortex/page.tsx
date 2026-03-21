"use client";

import { SettingsPageLayout } from "@/components/settings/settings-page-layout";
import { CortexContent } from "@/components/cortex/cortex-content";

export default function CortexPage() {
  return (
    <SettingsPageLayout title="storage" subtitle="database & inference">
      <CortexContent />
    </SettingsPageLayout>
  );
}
