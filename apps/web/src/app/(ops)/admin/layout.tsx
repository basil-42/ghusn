import { AlertTriangle } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { PushPrompt } from "@/components/admin/push-prompt";
import { AdminShell } from "@/components/admin/shell";
import { NAV_COOKIE, navFor, quickActionsFor } from "@/lib/admin-nav";
import { ROLE_LABELS, isRoleName, roleCan } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { isSellingRateStale } from "@/lib/exchange-rates";
import { pushConfig } from "@/lib/push";
import { RegisterServiceWorker } from "@/lib/pos-offline/register-sw";

/** إطار الإدارة (D-119): القائمة المجمّعة الثابتة والشريط العلوي — كل رابط حسب صلاحية الدور (D-62). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();
  const roleLabel = isRoleName(user.role) ? ROLE_LABELS[user.role] : "";
  const [rateMissing, jar] = await Promise.all([
    roleCan(user.role, { exchangeRate: ["update"] }) ? isSellingRateStale() : false,
    cookies(),
  ]);

  return (
    <>
      {/* نفس عامل نقطة البيع (النطاق /) — وفي التطوير يزيل أي نسخة قديمة */}
      <RegisterServiceWorker />
      <AdminShell
        nav={navFor(user.role)}
        quick={quickActionsFor(user.role)}
        user={{ name: user.name, roleLabel }}
        initialCollapsed={jar.get(NAV_COOKIE)?.value === "collapsed"}
        notice={
          <>
            <PushPrompt publicKey={pushConfig()?.publicKey ?? null} />
            {rateMissing ? (
              <Link
                href="/admin/exchange-rates"
                className="flex items-center gap-2 border-b border-gold/40 bg-gold/10 px-4 py-3 text-sm font-semibold text-warning md:px-8"
              >
                <AlertTriangle aria-hidden className="size-4 shrink-0" />
                لم يُدخل سعر الجنيه لليوم بعد — اضغطي هنا لإدخاله
              </Link>
            ) : null}
          </>
        }
      >
        {children}
      </AdminShell>
    </>
  );
}
