/** نموذج قائمة الإدارة — أنواع ودوال صافية بلا صلاحيات، تُستخدم في المتصفح والخادم (D-119). */

export const NAV_COOKIE = "ghusn_nav";

export type NavIcon =
  | "dashboard"
  | "pos"
  | "orders"
  | "sales"
  | "customers"
  | "products"
  | "stock"
  | "shipments"
  | "expenses"
  | "wallets"
  | "rates"
  | "reports"
  | "insights"
  | "store"
  | "settings";

export interface NavSection {
  key: string;
  label: string;
  icon: NavIcon;
  href: string;
  badge?: "orders";
  /** الصفحات المسموحة (للتبويبات ولتحديد الرابط النشط) */
  pages: { href: string; label: string }[];
}

export interface NavModel {
  groups: { label: string | null; sections: NavSection[] }[];
  footer: NavSection | null;
}

export interface QuickAction {
  href: string;
  label: string;
}

/** القسم النشط لمسار: أطول بادئة مطابقة من صفحاته («/admin» للرئيسية بالضبط). */
export function activeSection(model: NavModel, pathname: string): NavSection | null {
  const all = [...model.groups.flatMap((g) => g.sections), ...(model.footer ? [model.footer] : [])];
  let best: { section: NavSection; length: number } | null = null;
  for (const s of all) {
    for (const p of s.pages) {
      const hit =
        p.href === "/admin" ? pathname === "/admin" : pathname === p.href || pathname.startsWith(`${p.href}/`);
      if (hit && (!best || p.href.length > best.length)) best = { section: s, length: p.href.length };
    }
  }
  return best?.section ?? null;
}
