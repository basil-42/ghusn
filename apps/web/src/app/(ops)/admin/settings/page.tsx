import { prisma } from "@ghusn/db";
import type { Metadata } from "next";
import { Receipt } from "@/components/receipt";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { getPosSettings, getReceiptSettings, getStoreSettings } from "@/lib/settings";
import { listExpenseCategories } from "@/lib/expenses";
import { ExpenseCategoryForm, PosSettingsForm, ReceiptSettingsForm, StoreSettingsForm } from "./forms";

export const metadata: Metadata = { title: "الضبط | غصن" };

const SAMPLE = {
  number: "INV-2026-000001",
  createdAt: new Date(),
  cashierName: "سارة",
  customer: { phone: "+249912345678", name: null },
  subtotalSdg: "320000",
  discountSdg: "20000",
  totalSdg: "300000",
  cashTenderedSdg: "150000",
  changeSdg: "50000",
  lines: [
    { id: "1", label: "عطر ورد طائفي", qty: "1", unitPriceSdg: "120000", lineDiscountSdg: "0", amountSdg: "120000" },
    { id: "2", label: "عطر عود ملكي", qty: "1", unitPriceSdg: "200000", lineDiscountSdg: "0", amountSdg: "200000" },
  ],
  payments: [
    { method: "CASH" as const, amountSdg: "100000", reference: null },
    { method: "BANKAK" as const, amountSdg: "200000", reference: "123456" },
  ],
};

export default async function SettingsPage() {
  await requirePermission({ settings: ["update"] });
  const [pos, receipt, store, wallets, categories] = await Promise.all([
    getPosSettings(),
    getReceiptSettings(),
    getStoreSettings(),
    prisma.wallet.findMany({ where: { isActive: true, currencyCode: "SDG" }, orderBy: { name: "asc" } }),
    listExpenseCategories({ includeInactive: true }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold">الضبط</h1>
      <Card>
        <CardHeader>
          <CardTitle>نقطة البيع</CardTitle>
          <CardDescription>حد الخصم ومدة المرتجع والمحافظ التي يدخلها المقبوض (D-80).</CardDescription>
        </CardHeader>
        <PosSettingsForm initial={pos} wallets={wallets.map((w) => ({ value: w.id, label: w.name }))} />
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>المتجر الإلكتروني</CardTitle>
          <CardDescription>التوصيل عبر شركة توصيل، ورسومه يدفعها العميل لها (D-88).</CardDescription>
        </CardHeader>
        <StoreSettingsForm initial={store} wallets={wallets.map((w) => ({ value: w.id, label: w.name }))} />
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>أقسام المصاريف</CardTitle>
          <CardDescription>
            أضيفي أو عدّلي. القسم لا يُحذف بل يُوقف (مصاريفه السابقة تبقى في التقارير). «تسجّله الموظفة» = من درج
            الوردية وحتى الحد أعلاه.
          </CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-2">
          {categories.map((c) => (
            <ExpenseCategoryForm
              key={c.id}
              category={{ id: c.id, name: c.name, staffAllowed: c.staffAllowed, isActive: c.isActive }}
            />
          ))}
          <ExpenseCategoryForm />
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto]">
        <Card>
          <CardHeader>
            <CardTitle>الإيصال</CardTitle>
            <CardDescription>يُطبع على ورق حراري 80 مم. المعاينة تتحدث بعد الحفظ.</CardDescription>
          </CardHeader>
          <ReceiptSettingsForm initial={receipt} />
        </Card>
        <div className="self-start rounded-xl border border-border bg-white">
          <Receipt data={SAMPLE} settings={receipt} />
        </div>
      </div>
    </div>
  );
}
