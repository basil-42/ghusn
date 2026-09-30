import type { Metadata } from "next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { findSaleForReturn } from "@/lib/returns";
import { getPosSettings } from "@/lib/settings";
import { getOpenShift } from "@/lib/shifts";
import Link from "next/link";
import { ReturnForm } from "./return-form";

export const metadata: Metadata = { title: "مرتجع | غصن" };

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ invoice?: string }> }) {
  const { user } = await requirePermission({ pos: ["sell"] });
  const { invoice = "" } = await searchParams;
  const [shift, settings] = await Promise.all([getOpenShift(user.id), getPosSettings()]);
  if (!shift) {
    return (
      <Card className="mx-auto max-w-md">
        <p>افتحي الوردية أولاً — المردود النقدي يخرج من درجها.</p>
        <Link href="/pos" className="font-semibold underline">
          فتح وردية
        </Link>
      </Card>
    );
  }
  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <CardTitle>مرتجع أو استبدال</CardTitle>
        <CardDescription>
          بالإيصال خلال {settings.returnDays} أيام، بالسعر المدفوع فعلاً بعد الخصم. السليم يعود للمخزون، والتالف
          يُسجَّل.
        </CardDescription>
      </CardHeader>
      <ReturnForm
        initialNumber={invoice}
        initialSale={invoice ? await findSaleForReturn(invoice.slice(0, 30)) : null}
      />
    </Card>
  );
}
