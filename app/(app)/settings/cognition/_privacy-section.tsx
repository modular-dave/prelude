"use client";

import { useEffect, useState, useCallback } from "react";
import { Section } from "@/components/settings/settings-primitives";

export function PrivacySection() {
  const [privacy, setPrivacy] = useState({
    defaultVisibility: "private" as "private" | "shared" | "public",
    alwaysPrivateTypes: ["self_model"] as string[],
    veniceOnly: false,
    encryptAtRest: false,
  });

  const refreshPrivacy = useCallback(async () => {
    try {
      const res = await fetch("/api/cortex/privacy");
      setPrivacy(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshPrivacy();
  }, [refreshPrivacy]);

  const updatePrivacy = (partial: Partial<typeof privacy>) => {
    const updated = { ...privacy, ...partial };
    setPrivacy(updated);
    fetch("/api/cortex/privacy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    }).catch(() => {});
  };

  return (
    <Section title="privacy & governance" defaultOpen>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="t-small" style={{ color: "var(--text-muted)" }}>Visibility</span>
          {(["private", "shared", "public"] as const).map((v) => (
            <label key={v} className="flex items-center gap-1 cursor-pointer">
              <input type="radio" name="visibility" checked={privacy.defaultVisibility === v}
                onChange={() => updatePrivacy({ defaultVisibility: v })} />
              <span className="t-small" style={{ color: "var(--text)" }}>{v}</span>
            </label>
          ))}
        </div>
        <div>
          <span className="t-micro" style={{ color: "var(--text-faint)" }}>Always Private</span>
          <div className="flex gap-2 mt-1">
            {["self_model", "introspective"].map((t) => (
              <label key={t} className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={privacy.alwaysPrivateTypes.includes(t)}
                  onChange={(e) => {
                    const types = e.target.checked
                      ? [...privacy.alwaysPrivateTypes, t]
                      : privacy.alwaysPrivateTypes.filter((x) => x !== t);
                    updatePrivacy({ alwaysPrivateTypes: types });
                  }} />
                <span className="t-small" style={{ color: "var(--text-muted)" }}>{t}</span>
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={privacy.veniceOnly} onChange={(e) => updatePrivacy({ veniceOnly: e.target.checked })} />
          <span className="t-small" style={{ color: "var(--text-muted)" }}>Venice-only (never send to Anthropic)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={privacy.encryptAtRest} onChange={(e) => updatePrivacy({ encryptAtRest: e.target.checked })} />
          <span className="t-small" style={{ color: "var(--text-muted)" }}>Encrypt memories at rest</span>
        </label>
      </div>
    </Section>
  );
}
