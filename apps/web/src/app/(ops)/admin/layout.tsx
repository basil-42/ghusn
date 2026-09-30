import { AlertTriangle, LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/(ops)/login/actions";
import { AdminNav, type NavItem } from "@/components/admin/nav";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS, isRoleName, roleCan } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { isSellingRateStale } from "@/lib/exchange-rates";
import { RegisterServiceWorker } from "@/lib/pos-offline/register-sw";

type Permissions = Parameters<typeof roleCan>[1];

// كل رابط يظهر فقط لمن يملك صلاحيته (D-62)
const NAV: (NavItem & { permission?: Permissions })[] = [
  { href: "/admin", label: "الرئيسية", icon: "dashboard" },
  { href: "/pos", label: "نقطة البيع", icon: "pos", permission: { pos: ["sell"] } },
  { href: "/admin/orders", label: "طلبات المتجر", icon: "orders", permission: { order: ["read"] } },
  { href: "/admin/sales", label: "المبيعات", icon: "sales", permission: { sale: ["read"] } },
  { href: "/admin/reports", label: "التقرير الشهري", icon: "reports", permission: { report: ["read"] } },
  { href: "/admin/expenses", label: "المصاريف", icon: "expenses", permission: { expense: ["create"] } },
  { href: "/admin/wallets", label: "المحافظ", icon: "wallets", permission: { wallet: ["update"] } },
  { href: "/admin/products", label: "المنتجات", icon: "products", permission: { product: ["read"] } },
  { href: "/admin/stock", label: "المخزون", icon: "stock", permission: { stock: ["read"] } },
  { href: "/admin/pricing", label: "الأسعار", icon: "pricing", permission: { price: ["approve"] } },
  { href: "/admin/labels", label: "الملصقات", icon: "labels", permission: { product: ["read"] } },
  { href: "/admin/categories", label: "الأقسام", icon: "categories", permission: { category: ["update"] } },
  { href: "/admin/shipments", label: "الشحنات", icon: "shipments", permission: { shipment: ["read"] } },
  { href: "/admin/suppliers", label: "الموردون", icon: "suppliers", permission: { supplier: ["read"] } },
  { href: "/admin/exchange-rates", label: "سعر الصرف", icon: "rates", permission: { exchangeRate: ["read"] } },
  { href: "/admin/settings", label: "الضبط", icon: "settings", permission: { settings: ["update"] } },
  { href: "/admin/users", label: "المستخدمون", icon: "users", permission: { user: ["list"] } },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();
  const roleLabel = isRoleName(user.role) ? ROLE_LABELS[user.role] : "";
  const items = NAV.filter((i) => !i.permission || roleCan(user.role, i.permission)).map(({ href, label, icon }) => ({
    href,
    label,
    icon,
  }));
  const rateMissing = roleCan(user.role, { exchangeRate: ["update"] }) && (await isSellingRateStale());

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      {/* نفس عامل نقطة البيع (النطاق /) — وفي التطوير يزيل أي نسخة قديمة */}
      <RegisterServiceWorker />
      {/* شريط جانبي على الشاشات الكبيرة */}
      <aside className="hidden border-e border-border bg-card md:flex md:flex-col md:gap-6 md:p-4">
        <Link href="/admin" aria-label="الرئيسية" className="px-2 pt-2">
          <Image src="/brand/logo-ar-mark-forest.svg" alt="غصن" width={110} height={57} loading="eager" />
        </Link>
        <AdminNav items={items} orientation="vertical" />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="border-b border-border bg-card">
          <div className="flex items-center justify-between gap-3 px-4 py-2">
            <Link href="/admin" aria-label="الرئيسية" className="md:hidden">
              <Image src="/brand/logo-ar-mark-forest.svg" alt="غصن" width={88} height={45} loading="eager" />
            </Link>
            <span className="truncate text-sm md:ms-auto">
              {user.name} <span className="text-muted-foreground">· {roleLabel}</span>
            </span>
            <form action={logout}>
              <Button variant="outline" size="sm" type="submit">
                <LogOut aria-hidden /> خروج
              </Button>
            </form>
          </div>
          {/* قائمة أفقية على الجوال */}
          <div className="px-2 pb-2 md:hidden">
            <AdminNav items={items} orientation="horizontal" />
          </div>
        </header>

        {rateMissing ? (
          <Link
            href="/admin/exchange-rates"
            className="flex items-center gap-2 border-b border-gold/40 bg-gold/10 px-4 py-3 text-sm font-semibold text-warning"
          >
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            لم يُدخل سعر الجنيه لليوم بعد — اضغطي هنا لإدخاله
          </Link>
        ) : null}

        <main className="mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
      </div>
    </div>
  );
}
