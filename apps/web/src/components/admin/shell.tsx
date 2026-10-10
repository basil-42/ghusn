"use client";

import {
  ArrowLeftRight,
  ChartColumn,
  ChartNoAxesCombined,
  ChevronsLeft,
  ChevronsRight,
  Contact,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Receipt,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  Wallet,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/(ops)/login/actions";
import {
  NAV_COOKIE,
  activeSection,
  type NavIcon,
  type NavModel,
  type NavSection,
  type QuickAction,
} from "@/lib/admin-nav-model";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./notification-bell";
import { usePendingOrders } from "./pending-orders";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  pos: ShoppingCart,
  orders: ShoppingBag,
  sales: Receipt,
  customers: Contact,
  products: Package,
  stock: Warehouse,
  shipments: Truck,
  expenses: Wallet,
  wallets: Landmark,
  rates: ArrowLeftRight,
  reports: ChartColumn,
  insights: ChartNoAxesCombined,
  store: Store,
  settings: Settings,
};

/**
 * إطار الإدارة (D-119): قائمة جانبية داكنة ثابتة بمجموعات (تُطوى إلى أيقونات)، وشريط علوي ثابت،
 * والمحتوى وحده يتمرر. على الجوال تُفتح القائمة درجاً من زر القائمة.
 */
export function AdminShell({
  nav,
  user,
  quick,
  initialCollapsed,
  notice,
  children,
}: {
  nav: NavModel;
  user: { name: string; roleLabel: string };
  quick: QuickAction[];
  initialCollapsed: boolean;
  /** شريط تحت الرأس (تنبيه سعر الصرف، تفعيل الإشعارات) */
  notice?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [drawerPath, setDrawerPath] = useState(pathname);
  // إغلاق الدرج عند الانتقال لصفحة أخرى
  if (drawer && drawerPath !== pathname) {
    setDrawer(false);
    setDrawerPath(pathname);
  }
  const current = activeSection(nav, pathname);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${NAV_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <div className="min-h-screen">
      <aside
        aria-label="القائمة"
        className={cn(
          "fixed inset-y-0 start-0 z-40 hidden flex-col bg-forest text-ivory md:flex",
          collapsed ? "w-[4.5rem]" : "w-60",
        )}
      >
        <Sidebar nav={nav} user={user} current={current} collapsed={collapsed} onToggle={toggleCollapsed} />
      </aside>

      {drawer ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="القائمة">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            className="absolute inset-0 bg-forest/50"
            onClick={() => setDrawer(false)}
          />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-forest text-ivory shadow-xl">
            <Sidebar nav={nav} user={user} current={current} collapsed={false} onClose={() => setDrawer(false)} />
          </aside>
        </div>
      ) : null}

      <div className={cn("flex min-h-screen min-w-0 flex-col", collapsed ? "md:ps-[4.5rem]" : "md:ps-60")}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-card px-3 md:px-6">
          <button
            type="button"
            aria-label="فتح القائمة"
            onClick={() => {
              setDrawerPath(pathname);
              setDrawer(true);
            }}
            className="flex size-11 items-center justify-center rounded-xl border border-border md:hidden"
          >
            <Menu aria-hidden className="size-5" />
          </button>
          <Link href="/admin" aria-label="الرئيسية" className="md:hidden">
            <Image src="/brand/logo-ar-mark-forest.svg" alt="غصن" width={74} height={38} loading="eager" />
          </Link>
          <span className="flex-1" />
          {quick.length ? <QuickMenu actions={quick} /> : null}
          <NotificationBell />
        </header>
        {notice}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
          {current && current.pages.length > 1 && current.pages.some((p) => p.href === pathname) ? (
            <SectionTabs section={current} pathname={pathname} />
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  nav,
  user,
  current,
  collapsed,
  onToggle,
  onClose,
}: {
  nav: NavModel;
  user: { name: string; roleLabel: string };
  current: NavSection | null;
  collapsed: boolean;
  onToggle?: () => void;
  onClose?: () => void;
}) {
  return (
    <>
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-ivory/10",
          collapsed ? "justify-center" : "justify-between px-4",
        )}
      >
        <Link href="/admin" aria-label="الرئيسية">
          {collapsed ? (
            <Image src="/brand/mark-cream.svg" alt="غصن" width={31} height={40} loading="eager" />
          ) : (
            <Image src="/brand/logo-ar-mark-cream.svg" alt="غصن" width={86} height={44} loading="eager" />
          )}
        </Link>
        {onClose ? (
          <button
            type="button"
            aria-label="إغلاق القائمة"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-xl bg-ivory/10"
          >
            <X aria-hidden className="size-5" />
          </button>
        ) : null}
      </div>

      <nav aria-label="القائمة الرئيسية" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 py-3">
        {nav.groups.map((g, i) => (
          <div key={g.label ?? i} className="flex flex-col gap-0.5">
            {g.label ? (
              collapsed ? (
                <span aria-hidden className="mx-3 my-2 border-t border-ivory/10" />
              ) : (
                <span className="mx-3 mt-4 mb-1 text-[11px] font-bold text-ivory/60">{g.label}</span>
              )
            ) : null}
            {g.sections.map((s) => (
              <NavLink key={s.key} section={s} active={current?.key === s.key} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </nav>

      <div className="flex shrink-0 flex-col gap-0.5 border-t border-ivory/10 p-2.5">
        {nav.footer ? (
          <NavLink section={nav.footer} active={current?.key === nav.footer.key} collapsed={collapsed} />
        ) : null}
        <div className={cn("flex items-center gap-2 py-1.5", collapsed ? "flex-col" : "px-2")}>
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sage font-bold text-ivory"
          >
            {user.name.trim().charAt(0)}
          </span>
          {collapsed ? null : (
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <b className="truncate text-sm">{user.name}</b>
              <span className="text-xs text-ivory/60">{user.roleLabel}</span>
            </span>
          )}
          <form action={logout}>
            <button
              type="submit"
              aria-label="خروج"
              title="خروج"
              className="flex size-10 items-center justify-center rounded-xl text-ivory/80 hover:bg-ivory/10 hover:text-ivory"
            >
              <LogOut aria-hidden className="size-5" />
            </button>
          </form>
        </div>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "توسيع القائمة" : "طي القائمة"}
            title={collapsed ? "توسيع القائمة" : "طي القائمة"}
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-xl text-sm text-ivory/70 hover:bg-ivory/10 hover:text-ivory",
              collapsed ? "justify-center" : "px-3",
            )}
          >
            {/* في العربية القائمة يميناً: الطي يشير لليمين */}
            {collapsed ? (
              <ChevronsLeft aria-hidden className="size-5" />
            ) : (
              <ChevronsRight aria-hidden className="size-5" />
            )}
            {collapsed ? null : "طي القائمة"}
          </button>
        ) : null}
      </div>
    </>
  );
}

function NavLink({ section, active, collapsed }: { section: NavSection; active: boolean; collapsed: boolean }) {
  const Icon = ICONS[section.icon];
  const pending = usePendingOrders();
  const badge = section.badge === "orders" && pending ? pending : null;
  return (
    <Link
      href={section.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? section.label : undefined}
      title={collapsed ? section.label : undefined}
      className={cn(
        "relative flex min-h-10 items-center gap-3 rounded-xl text-sm font-semibold transition-colors",
        collapsed ? "justify-center" : "px-3",
        active ? "bg-ivory text-forest" : "text-ivory/85 hover:bg-ivory/10 hover:text-ivory",
      )}
    >
      <Icon aria-hidden className="size-[1.15rem] shrink-0" />
      {collapsed ? null : <span className="min-w-0 flex-1 truncate">{section.label}</span>}
      {badge ? (
        <span
          className={cn(
            "flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[11px] font-bold text-forest tabular-nums",
            collapsed && "absolute -top-1 start-1",
          )}
        >
          <span className="sr-only">بانتظار المتابعة: </span>
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

/** تبويبات صفحات القسم الواحد (المنتجات · الأسعار · الملصقات…). */
function SectionTabs({ section, pathname }: { section: NavSection; pathname: string }) {
  return (
    <nav aria-label={section.label} className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-border px-1">
      {section.pages.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          aria-current={p.href === pathname ? "page" : undefined}
          className={cn(
            "shrink-0 border-b-[3px] px-4 py-2.5 text-sm",
            p.href === pathname
              ? "border-primary font-bold"
              : "border-transparent font-semibold text-muted-foreground hover:text-foreground",
          )}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

/** «+ جديد»: قائمة منسدلة بأكثر ما يُنشأ. */
function QuickMenu({ actions }: { actions: QuickAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
      >
        <Plus aria-hidden className="size-4" /> جديد
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute end-0 top-full z-40 mt-2 flex w-52 flex-col rounded-2xl border border-border bg-card p-1.5 shadow-lg"
        >
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold hover:bg-muted"
            >
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
