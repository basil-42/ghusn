"use client";

import { ArrowLeftRight, LayoutDashboard, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ICONS = { dashboard: LayoutDashboard, rates: ArrowLeftRight, users: Users } satisfies Record<string, LucideIcon>;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

export function AdminNav({ items, orientation }: { items: NavItem[]; orientation: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="القائمة الرئيسية"
      className={cn(orientation === "vertical" ? "flex flex-col gap-1" : "flex gap-1 overflow-x-auto")}
    >
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 font-semibold transition-colors",
              active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            <Icon aria-hidden className="size-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
