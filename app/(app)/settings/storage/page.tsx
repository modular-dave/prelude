"use client";

import { SettingsPageLayout } from "@/components/settings/settings-page-layout";
import { CortexContent } from "@/components/cortex/cortex-content";

export default function SettingsPage() {
  return (
    <SettingsPageLayout title="storage" subtitle="database & inference">
      <CortexContent />
    </SettingsPageLayout>
  );
}
