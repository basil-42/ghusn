import { prisma } from "@ghusn/db";
import { Button } from "@/components/ui";
import { ROLE_LABELS, ROLE_NAMES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { setBanned, setRole } from "./actions";
import { CreateUserForm, ResetPasswordForm } from "./forms";

export default async function UsersPage() {
  const session = await requirePermission({ user: ["list"] });
  const users = await prisma.user.findMany({
    orderBy: [{ banned: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, phoneNumber: true, role: true, banned: true },
  });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-3xl font-bold">المستخدمون</h1>

      <section className="rounded-2xl border border-line bg-white p-6">
        <h2 className="mb-4 text-lg font-bold">إضافة مستخدم</h2>
        <CreateUserForm />
      </section>

      <section className="flex flex-col gap-3">
        {users.map((u) => {
          const isSelf = u.id === session.user.id;
          return (
            <article
              key={u.id}
              className={`flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 ${u.banned ? "opacity-60" : ""}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">
                    {u.name} {isSelf ? <span className="text-sm font-normal text-sage">(أنت)</span> : null}
                  </p>
                  <p dir="ltr" className="text-end text-sm tabular-nums text-sage">
                    {u.phoneNumber ?? "—"}
                  </p>
                </div>
                <span className="rounded-full bg-ivory px-3 py-1 text-sm font-semibold">
                  {ROLE_LABELS[u.role]}
                  {u.banned ? " · موقوف" : ""}
                </span>
              </div>

              {isSelf ? null : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <form action={setRole} className="flex min-w-0 gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <select
                      name="role"
                      defaultValue={u.role}
                      aria-label="الدور"
                      className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3"
                    >
                      {ROLE_NAMES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" variant="ghost">
                      تغيير
                    </Button>
                  </form>
                  <ResetPasswordForm userId={u.id} />
                  <form action={setBanned} className="min-w-0">
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="banned" value={String(!u.banned)} />
                    <Button type="submit" variant="ghost" className="w-full">
                      {u.banned ? "إعادة تفعيل" : "إيقاف الحساب"}
                    </Button>
                  </form>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
