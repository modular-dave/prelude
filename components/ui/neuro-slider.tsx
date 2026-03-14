"use client";

interface NeuroSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}

export function NeuroSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue,
}: NeuroSliderProps) {
  const display = formatValue ? formatValue(value) : String(value);
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <span className="text-[10px] font-mono" style={{ color: "var(--accent)" }}>
          {display}
        </span>
      </div>
      <div className="relative h-5 flex items-center">
        <div
          className="absolute left-0 right-0 h-[3px] rounded-full"
          style={{ background: "var(--bar-track)" }}
        />
        <div
          className="absolute left-0 h-[3px] rounded-full"
          style={{ width: `${pct}%`, background: "var(--accent)" }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="neuro-range absolute inset-0 w-full cursor-pointer"
        />
      </div>
    </div>
  );
}
