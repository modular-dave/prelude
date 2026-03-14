"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, MessageCircle, Database, Moon, BarChart3 } from "lucide-react";
import { useMemory } from "@/lib/memory-context";
import { PulseOrb } from "@/components/ui/pulse-orb";

const NAV_ITEMS = [
  { href: "/", icon: Brain, label: "Brain" },
  { href: "/chat", icon: MessageCircle, label: "Chat" },
  { href: "/memories", icon: Database, label: "Memories" },
  { href: "/dreams", icon: Moon, label: "Dreams" },
  { href: "/stats", icon: BarChart3, label: "Stats" },
];

export function DashboardNav() {
  const pathname = usePathname();
  const { memories } = useMemory();

  return (
    <nav className="flex w-16 flex-col items-center border-r border-neutral-800 bg-neutral-950 py-4 lg:w-52">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-2 px-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
          <Brain className="h-4 w-4 text-white" />
        </div>
        <span className="hidden text-sm font-semibold lg:block">Prelude</span>
      </div>

      {/* Nav items */}
      <div className="flex flex-1 flex-col gap-1 px-2 w-full">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-neutral-800 text-white"
                  : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden lg:block">{label}</span>
            </Link>
          );
        })}
      </div>

      {/* Status */}
      <div className="mt-auto flex items-center gap-2 px-3 py-2">
        <PulseOrb color="#22c55e" size={6} />
        <span className="hidden text-[11px] text-neutral-500 lg:block">
          {memories.length} memories
        </span>
      </div>
    </nav>
  );
}
