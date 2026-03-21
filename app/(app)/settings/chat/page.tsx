"use client";

import { useEffect, useState } from "react";
import { SettingsPageLayout } from "@/components/settings/settings-page-layout";
import { Section, Divider } from "@/components/settings/settings-primitives";
import { loadChatSettings, saveChatSettings, type ChatSettings } from "@/lib/chat-settings";

interface SearchResult {
  content: string;
  citations: string[];
}

function ChatSearchSection() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResult(null);
    try {
      const res = await fetch("/api/chat/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: query.trim() }],
          query: query.trim(),
        }),
      });
      setResult(await res.json());
    } catch {
      setResult(null);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Section title="chat search">
      <p className="t-tiny mb-1.5" style={{ color: "var(--text-faint)" }}>
        search with Venice web augmentation — returns answer with citations
      </p>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") search(); }}
          placeholder="search query..."
          className="flex-1 rounded-[4px] px-2 py-1 t-small outline-none"
          style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}
        />
        <button
          onClick={search}
          disabled={searching}
          className="t-small transition active:scale-95"
          style={{ color: "var(--accent)" }}
        >
          {searching ? "..." : "search"}
        </button>
      </div>
      {result && (
        <div className="mt-2 space-y-1.5">
          <div
            className="rounded-[4px] p-2 t-small max-h-48 overflow-y-auto"
            style={{ background: "var(--surface-dimmer)", color: "var(--text)", lineHeight: 1.6 }}
          >
            {result.content}
          </div>
          {result.citations?.length > 0 && (
            <div>
              <span className="t-micro" style={{ color: "var(--text-faint)" }}>citations</span>
              <div className="space-y-0.5 mt-0.5">
                {result.citations.map((c, i) => (
                  <div key={i} className="t-micro truncate" style={{ color: "var(--accent)" }}>
                    {c}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

export default function ChatPage() {
  const [settings, setSettings] = useState<ChatSettings>({ webSearchEnabled: false });
  const [veniceAvailable, setVeniceAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    setSettings(loadChatSettings());

    // Check if Venice is configured (needed for web search)
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        const hasVenice = !!data.inference?.connected &&
          (data.inference?.provider === "venice" || process.env.NEXT_PUBLIC_VENICE_CONFIGURED === "true");
        setVeniceAvailable(hasVenice);
        // Force toggle off if Venice isn't configured
        if (!hasVenice) {
          const current = loadChatSettings();
          if (current.webSearchEnabled) {
            saveChatSettings({ ...current, webSearchEnabled: false });
            setSettings((s) => ({ ...s, webSearchEnabled: false }));
          }
        }
      })
      .catch(() => {
        setVeniceAvailable(false);
        const current = loadChatSettings();
        if (current.webSearchEnabled) {
          saveChatSettings({ ...current, webSearchEnabled: false });
          setSettings((s) => ({ ...s, webSearchEnabled: false }));
        }
      });
  }, []);

  const update = (partial: Partial<ChatSettings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    saveChatSettings(updated);
  };

  return (
    <SettingsPageLayout title="chat" subtitle="behavior & augmentation">
      {/* ── Web Search ── */}
      <Section title="web search" defaultOpen>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.webSearchEnabled}
              disabled={veniceAvailable === false}
              onChange={(e) => update({ webSearchEnabled: e.target.checked })}
            />
            <span className="t-small" style={{ color: "var(--text)" }}>Enable web search</span>
          </label>
          <p className="t-tiny" style={{ color: "var(--text-faint)", lineHeight: 1.6 }}>
            Augment chat responses with live web results and citations.
            Powered by Venice AI — requires Venice credentials in inference settings.
          </p>
          <div className="flex items-center gap-1.5">
            <span
              className="h-[5px] w-[5px] rounded-full shrink-0"
              style={{
                background: veniceAvailable === null
                  ? "var(--text-faint)"
                  : veniceAvailable
                    ? "var(--success)"
                    : "var(--error)",
              }}
            />
            <span className="t-tiny" style={{
              color: veniceAvailable === null
                ? "var(--text-faint)"
                : veniceAvailable
                  ? "var(--success)"
                  : "var(--error)",
            }}>
              {veniceAvailable === null
                ? "checking..."
                : veniceAvailable
                  ? "venice available"
                  : "venice not configured"}
            </span>
          </div>
        </div>
      </Section>

      <Divider />

      {/* ── Chat Search ── */}
      <ChatSearchSection />
    </SettingsPageLayout>
  );
}
