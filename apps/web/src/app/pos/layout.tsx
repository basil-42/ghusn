import { LayoutDashboard, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "نقطة البيع | غصن" };

/** نقطة البيع بشاشة كاملة (بلا قائمة الإدارة) — للجوال والتابلت في المحل. */
export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePermission({ pos: ["sell"] });
  return (
    <div className="flex min-h-screen flex-col bg-background print:bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2 print:hidden">
        <Link href="/pos" aria-label="نقطة البيع">
          <Image src="/brand/logo-ar-mark-forest.svg" alt="غصن" width={88} height={45} loading="eager" />
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden truncate text-sm sm:inline">{user.name}</span>
          <Button asChild variant="outline" size="sm">
            <Link href="/pos/shift">الوردية</Link>
          </Button>
          {roleCan(user.role, { product: ["read"] }) ? (
            <Button asChild variant="ghost" size="sm" aria-label="لوحة الإدارة">
              <Link href="/admin">
                <LayoutDashboard aria-hidden />
              </Link>
            </Button>
          ) : null}
          <form action={logout}>
            <Button variant="ghost" size="sm" type="submit" aria-label="خروج">
              <LogOut aria-hidden />
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 print:p-0">{children}</main>
    </div>
  );
}
