"use client";

export function ImportanceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const hue = value > 0.7 ? 142 : value > 0.4 ? 45 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: `hsl(${hue}, 70%, 55%)`,
          }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-neutral-500">{pct}%</span>
    </div>
  );
}
