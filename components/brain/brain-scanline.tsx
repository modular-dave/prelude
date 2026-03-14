"use client";

import { useMemo } from "react";

function brainContour(lines: number): number[] {
  const widths: number[] = [];
  for (let i = 0; i < lines; i++) {
    const t = i / (lines - 1);
    const base = Math.sin(t * Math.PI);
    const asym = t < 0.5 ? 0.85 + 0.15 * Math.sin(t * Math.PI * 2) : 1;
    const noise = 0.9 + 0.1 * Math.sin(i * 0.7);
    widths.push(base * asym * noise);
  }
  return widths;
}

export function BrainScanline({ size = 200 }: { size?: number }) {
  const lines = 80;
  const widths = useMemo(() => brainContour(lines), []);

  return (
    <div
      className="relative opacity-25"
      style={{ width: size, height: size }}
    >
      {widths.map((w, i) => (
        <div
          key={i}
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: `${(i / lines) * 100}%`,
            width: `${w * 80}%`,
            height: 1.5,
            background: `linear-gradient(90deg, transparent, var(--episodic) 30%, var(--self-model) 70%, transparent)`,
            animation: `scanPulse ${2.5 + (i % 7) * 0.3}s ease-in-out ${(i % 11) * 0.15}s infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}
