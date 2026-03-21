"use client";

import { useState, useCallback } from "react";

export interface TestResult {
  ok: boolean;
  error?: string;
  dimensions?: number;
}

export interface ConnectionTestState {
  testingInference: boolean;
  inferenceResult: TestResult | null;
  testingEmbedding: boolean;
  embeddingResult: TestResult | null;
  testInference: (baseUrl: string, model: string, apiKey?: string) => Promise<TestResult>;
  testEmbedding: (baseUrl: string, model: string, apiKey?: string, provider?: string) => Promise<TestResult>;
  clearResults: () => void;
}

export function useConnectionTest(): ConnectionTestState {
  const [testingInference, setTestingInference] = useState(false);
  const [inferenceResult, setInferenceResult] = useState<TestResult | null>(null);
  const [testingEmbedding, setTestingEmbedding] = useState(false);
  const [embeddingResult, setEmbeddingResult] = useState<TestResult | null>(null);

  const testInference = useCallback(async (
    baseUrl: string, model: string, apiKey?: string,
  ): Promise<TestResult> => {
    setTestingInference(true);
    setInferenceResult(null);
    try {
      const r = await fetch("/api/cortex/inference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", baseUrl, model, apiKey: apiKey || "local" }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await r.json();
      const result: TestResult = { ok: !!data.ok, error: data.error };
      setInferenceResult(result);
      return result;
    } catch (e) {
      const result: TestResult = { ok: false, error: e instanceof Error ? e.message : "failed" };
      setInferenceResult(result);
      return result;
    } finally {
      setTestingInference(false);
    }
  }, []);

  const testEmbedding = useCallback(async (
    baseUrl: string, model: string, apiKey?: string, provider?: string,
  ): Promise<TestResult> => {
    setTestingEmbedding(true);
    setEmbeddingResult(null);
    try {
      const r = await fetch("/api/cortex/embedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          baseUrl,
          model,
          apiKey: apiKey || "local",
          provider: provider || "unknown",
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await r.json();
      const result: TestResult = { ok: !!data.ok, error: data.error, dimensions: data.dimensions };
      setEmbeddingResult(result);
      return result;
    } catch (e) {
      const result: TestResult = { ok: false, error: e instanceof Error ? e.message : "failed" };
      setEmbeddingResult(result);
      return result;
    } finally {
      setTestingEmbedding(false);
    }
  }, []);

  return {
    testingInference,
    inferenceResult,
    testingEmbedding,
    embeddingResult,
    testInference,
    testEmbedding,
    clearResults: () => { setInferenceResult(null); setEmbeddingResult(null); },
  };
}
