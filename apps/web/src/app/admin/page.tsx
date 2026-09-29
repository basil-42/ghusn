import { requireSession } from "@/lib/auth/session";

export default async function AdminHome() {
  const { user } = await requireSession();

  return (
    <section className="flex flex-col gap-2">
      <h1 className="font-display text-3xl font-bold">أهلاً {user.name}</h1>
      <p className="text-sage">لوحة إدارة غصن — الشاشات تُضاف هنا تباعاً (سعر الصرف، المنتجات، الشحنات…).</p>
    </section>
  );
}
