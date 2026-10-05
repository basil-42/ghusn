import { Plus, Share } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { eventsForRole } from "@/lib/notifications";
import { getPushPrefs, listSubscriptions, pushConfig } from "@/lib/push";
import { Devices, SoundCard } from "./devices";
import { PrefsForm } from "./prefs-form";

export const metadata: Metadata = { title: "تفضيلات الإشعارات | غصن" };

const IOS_STEPS = [
  { text: "افتحي غصن في Safari (ليس Chrome)", icon: null },
  { text: "اضغطي زر المشاركة أسفل الشاشة", icon: Share },
  { text: "اختاري «إضافة إلى الشاشة الرئيسية» ثم «إضافة»", icon: Plus },
  { text: "افتحي غصن من أيقونته على الشاشة وسجّلي الدخول", icon: null },
  { text: "اضغطي «تفعيل» في هذه الصفحة أو في الشريط أعلى النظام، ثم «السماح»", icon: null },
];

/** تفضيلات الإشعارات لكل مستخدمة (D-109): الأجهزة، الصوت، الأحداث على الجوال، ساعات الهدوء. */
export default async function NotificationSettingsPage() {
  const session = await requireSession();
  const [prefs, subs] = await Promise.all([getPushPrefs(session.user.id), listSubscriptions(session.user.id)]);
  const events = eventsForRole(session.user.role).map((e) => ({
    type: e.type,
    label: e.label,
    hint: e.hint,
    priority: e.priority,
    push: prefs.pushTypes.includes(e.type),
  }));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <Link href="/admin/notifications" className="text-sm text-muted-foreground underline">
          الإشعارات
        </Link>
        <h1 className="font-display text-3xl font-bold">تفضيلات الإشعارات</h1>
        <p className="text-muted-foreground">
          داخل النظام تصلك كل الإشعارات المسموحة لصلاحياتك دائماً؛ هنا تختارين ما يصل للجوال.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <Devices
          publicKey={pushConfig()?.publicKey ?? null}
          devices={subs.map((s) => ({
            id: s.id,
            endpoint: s.endpoint,
            label: s.label,
            createdAt: s.createdAt.toISOString(),
            lastUsedAt: s.lastUsedAt.toISOString(),
          }))}
        />
        <SoundCard />
      </div>

      <PrefsForm
        events={events}
        quietStart={prefs.quietStart}
        quietEnd={prefs.quietEnd}
        urgentInQuiet={prefs.urgentInQuiet}
      />

      <section id="ios" className="flex scroll-mt-6 flex-col gap-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold">الإشعارات على آيفون</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          على آيفون تعمل الإشعارات فقط بعد إضافة غصن إلى الشاشة الرئيسية (iOS 16.4 أو أحدث). مرة واحدة فقط. على أندرويد
          لا حاجة لذلك — يكفي «تفعيل» من Chrome.
        </p>
        <ol className="flex flex-col gap-2">
          {IOS_STEPS.map((s, i) => (
            <li key={s.text} className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-forest font-bold text-ivory">
                {i + 1}
              </span>
              <span className="flex-1">{s.text}</span>
              {s.icon ? <s.icon aria-hidden className="size-5 text-muted-foreground" /> : null}
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">
          أندرويد: لتخصيص نغمة إشعارات غصن — إعدادات الهاتف ← التطبيقات ← Chrome ← الإشعارات ← ghusn.store.
        </p>
      </section>
    </div>
  );
}
