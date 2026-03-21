"use client";

import { SettingsPageLayout } from "@/components/settings/settings-page-layout";
import { EmbeddingContent } from "./_embedding-content";

export default function EmbeddingPage() {
  return (
    <SettingsPageLayout title="embedding" subtitle="servers, models & slots">
      <EmbeddingContent />
    </SettingsPageLayout>
  );
}
