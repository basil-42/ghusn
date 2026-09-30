import { AlertTriangle, Lock } from "lucide-react";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { MANUAL_SOURCES, SOURCE_LABELS, getRateBoard, getRateHistory, type RateCard } from "@/lib/exchange-rates";
import { formatDateTime, formatPercent, formatRate } from "@/lib/format";
import { RateForm } from "./rate-form";

export const metadata: Metadata = { title: "سعر الصرف | غصن" };

export default async function ExchangeRatesPage() {
  const session = await requirePermission({ exchangeRate: ["read"] });
  const canUpdate = roleCan(session.user.role, { exchangeRate: ["update"] });
  const [board, history] = await Promise.all([getRateBoard(), getRateHistory()]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold">سعر الصرف</h1>
        <p className="text-muted-foreground">كم وحدة من كل عملة تساوي دولاراً واحداً. الدولار هو عملة الأساس.</p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {board.map((card) => (
          <RateCardView key={card.currency.code} card={card} />
        ))}
      </section>

      {canUpdate ? (
        <Card>
          <CardHeader>
            <CardTitle>إدخال سعر جديد</CardTitle>
            <CardDescription>
              يسري من لحظة الحفظ. لتصحيح خطأ أدخلي السعر الصحيح — السجلات القديمة لا تُعدَّل لأنها مستخدمة في عمليات
              مسجّلة.
            </CardDescription>
          </CardHeader>
          <RateForm
            currencies={board
              .filter((c) => !c.isPegged)
              .map((c) => ({ value: c.currency.code, label: `${c.currency.nameAr} (${c.currency.code})` }))}
            sources={MANUAL_SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] }))}
          />
        </Card>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">السجل</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الوقت</TableHead>
              <TableHead>العملة</TableHead>
              <TableHead>السعر</TableHead>
              <TableHead>المصدر</TableHead>
              <TableHead>أدخله</TableHead>
              <TableHead>ملاحظة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{formatDateTime(r.effectiveAt)}</TableCell>
                <TableCell>{r.currency.nameAr}</TableCell>
                <TableCell dir="ltr" className="text-end font-semibold tabular-nums">
                  {formatRate(r.unitsPerUsd)}
                </TableCell>
                <TableCell>{SOURCE_LABELS[r.source]}</TableCell>
                <TableCell>{r.enteredBy?.name ?? "النظام"}</TableCell>
                <TableCell className="max-w-48 truncate text-muted-foreground">{r.note ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

function RateCardView({ card }: { card: RateCard }) {
  const { currency, current } = card;
  return (
    <Card className="gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{currency.nameAr}</p>
          <p className="text-sm text-muted-foreground">{currency.code}</p>
        </div>
        {card.isPegged ? (
          <Badge>
            <Lock aria-hidden className="size-3.5" /> ثابت
          </Badge>
        ) : card.isStale ? (
          <Badge variant="warning">لم يُحدَّث اليوم</Badge>
        ) : (
          <Badge variant="success">محدَّث اليوم</Badge>
        )}
      </div>

      {current ? (
        <>
          <p dir="ltr" className="text-end text-3xl font-bold tabular-nums">
            {formatRate(current.unitsPerUsd)} <span className="text-base font-semibold">{currency.symbol}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {SOURCE_LABELS[current.source]} · {formatDateTime(current.effectiveAt)}
            {current.enteredBy ? ` · ${current.enteredBy}` : ""}
          </p>
          {card.change ? (
            <p className="text-sm">
              التغيّر عن السابق:{" "}
              <span dir="ltr" className="font-semibold tabular-nums">
                {formatPercent(card.change)}
              </span>
            </p>
          ) : null}
          {card.needsPriceReview ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-warning">
              <AlertTriangle aria-hidden className="size-4" /> تغيّر أكثر من 5% — الأسعار تحتاج مراجعة
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-muted-foreground">لا يوجد سعر بعد.</p>
      )}
    </Card>
  );
}
