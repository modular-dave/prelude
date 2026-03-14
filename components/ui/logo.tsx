"use client";

/**
 * Geometric block "P" logo inspired by clude.io's block "C".
 * Single SVG path with eaten corner notch at bottom-right of bowl.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 6H72V48H62V58H30V94H10V6ZM30 24H52V40H30V24Z"
        fill="var(--accent)"
      />
    </svg>
  );
}
