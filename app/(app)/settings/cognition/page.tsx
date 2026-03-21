"use client";

import { useEffect, useState } from "react";
import { SettingsPageLayout } from "@/components/settings/settings-page-layout";
import { Divider, Section } from "@/components/settings/settings-primitives";
import { PrivacySection } from "./_privacy-section";
import { MeteringSection } from "./_metering-section";
import { ConceptsSection } from "./_concepts-section";
import { EntitiesSection } from "./_entities-section";
import { IdentitySection } from "./_identity-section";
import { TraceSection } from "./_trace-section";

function VerificationSection() {
  const [memoryId, setMemoryId] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<{ verified: boolean } | null>(null);

  const verify = async () => {
    const id = parseInt(memoryId, 10);
    if (!id) return;
    setVerifying(true);
    setResult(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryId: id }),
      });
      setResult(await res.json());
    } catch {
      setResult({ verified: false });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Section title="on-chain verification">
      <p className="t-tiny mb-1.5" style={{ color: "var(--text-faint)" }}>
        verify memory integrity on-chain via owner wallet
      </p>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={memoryId}
          onChange={(e) => setMemoryId(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") verify(); }}
          placeholder="memory ID"
          className="w-24 rounded-[4px] px-2 py-1 t-small outline-none"
          style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}
        />
        <button
          onClick={verify}
          disabled={verifying}
          className="t-small transition active:scale-95"
          style={{ color: "var(--accent)" }}
        >
          {verifying ? "..." : "verify"}
        </button>
      </div>
      {result && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <span
            className="h-[5px] w-[5px] rounded-full"
            style={{ background: result.verified ? "var(--success)" : "var(--error)" }}
          />
          <span className="t-small" style={{ color: result.verified ? "var(--success)" : "var(--error)" }}>
            {result.verified ? "verified" : "not verified"}
          </span>
        </div>
      )}
    </Section>
  );
}

export default function CognitionPage() {
  const [hasWallet, setHasWallet] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => setHasWallet(!!data.ownerWallet))
      .catch(() => {});
  }, []);

  return (
    <SettingsPageLayout title="cognition" subtitle="self, governance & tools">
      {/* ── Config ── */}
      <PrivacySection />
      <Divider />
      <MeteringSection />
      <Divider />
      <ConceptsSection />
      <Divider />
      <EntitiesSection />

      <Divider />

      {/* ── Inspection ── */}
      <IdentitySection />
      <Divider />
      <TraceSection />

      {/* ── Verification (only if wallet configured) ── */}
      {hasWallet && (
        <>
          <Divider />
          <VerificationSection />
        </>
      )}
    </SettingsPageLayout>
  );
}
