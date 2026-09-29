import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui";
import { ROLE_LABELS, isRoleName, roleCan } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();
  const roleLabel = isRoleName(user.role) ? ROLE_LABELS[user.role] : "";

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" aria-label="الرئيسية">
              <Image src="/brand/logo-ar-mark-forest.svg" alt="غصن" width={96} height={40} />
            </Link>
            <nav className="flex gap-4 text-sm font-semibold">
              <Link href="/admin" className="py-3 hover:text-sage">
                الرئيسية
              </Link>
              {roleCan(user.role, { user: ["list"] }) ? (
                <Link href="/admin/users" className="py-3 hover:text-sage">
                  المستخدمون
                </Link>
              ) : null}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm">
              {user.name} <span className="text-sage">· {roleLabel}</span>
            </span>
            <form action={logout}>
              <Button variant="ghost" type="submit">
                خروج
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
