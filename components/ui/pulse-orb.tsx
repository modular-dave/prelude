"use client";

export function PulseOrb({
  color = "#3b82f6",
  size = 8,
}: {
  color?: string;
  size?: number;
}) {
  return (
    <span className="relative inline-flex">
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40"
        style={{ backgroundColor: color }}
      />
      <span
        className="relative inline-flex rounded-full"
        style={{
          backgroundColor: color,
          width: size,
          height: size,
        }}
      />
    </span>
  );
}
