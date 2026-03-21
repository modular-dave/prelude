"use client";

import { SettingsPageLayout } from "@/components/settings/settings-page-layout";
import { InferenceContent } from "./_inference-content";

export default function InferencePage() {
  return (
    <SettingsPageLayout title="inference" subtitle="servers, models & routing">
      <InferenceContent />
    </SettingsPageLayout>
  );
}
