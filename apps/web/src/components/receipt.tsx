import { dec, plainNumber } from "@ghusn/core";
import Image from "next/image";
import { formatAmount, formatDateTime } from "@/lib/format";
import type { ReceiptSettings } from "@/lib/settings";

export interface ReceiptData {
  number: string;
  createdAt: Date;
  cashierName: string;
  customer: { phone: string; name: string | null } | null;
  subtotalSdg: string;
  discountSdg: string;
  totalSdg: string;
  cashTenderedSdg: string | null;
  changeSdg: string;
  lines: { id: string; label: string; qty: string; unitPriceSdg: string; lineDiscountSdg: string; amountSdg: string }[];
  payments: { method: "CASH" | "BANKAK"; amountSdg: string; reference: string | null }[];
}

const n = (v: string) => formatAmount(v, 0);

/**
 * إيصال حراري 80 مم (عرض طباعة 72 مم). النصوص من «الضبط» (D-80). الشعار الأفقي بعرض 45 مم
 * — فوق الحد الأدنى 40 مم (brand-identity).
 */
export function Receipt({ data, settings }: { data: ReceiptData; settings: ReceiptSettings }) {
  return (
    <article className="receipt mx-auto flex w-[72mm] flex-col gap-2 bg-white p-[3mm] text-[11pt] leading-snug text-black">
      <header className="flex flex-col items-center gap-1 text-center">
        {settings.showLogo ? (
          <Image
            src="/brand/logo-horizontal-forest.svg"
            alt="غصن"
            width={170}
            height={86}
            style={{ width: "45mm", height: "auto" }}
          />
        ) : (
          <p className="text-lg font-bold">غصن</p>
        )}
        {settings.tagline ? <p className="text-sm">{settings.tagline}</p> : null}
        {settings.address ? <p className="text-xs">{settings.address}</p> : null}
        {settings.phone || settings.whatsapp ? (
          <p className="text-xs" dir="ltr">
            {[settings.phone, settings.whatsapp && `WhatsApp ${settings.whatsapp}`].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {settings.instagram ? (
          <p className="text-xs" dir="ltr">
            {settings.instagram}
          </p>
        ) : null}
      </header>

      <div className="border-y border-dashed border-black py-1 text-xs">
        <div className="flex justify-between">
          <span>فاتورة</span>
          <bdi dir="ltr" className="font-bold">
            {data.number}
          </bdi>
        </div>
        <div className="flex justify-between">
          <span>التاريخ</span>
          <span>{formatDateTime(data.createdAt)}</span>
        </div>
        {settings.showCashier ? (
          <div className="flex justify-between">
            <span>البائعة</span>
            <span>{data.cashierName}</span>
          </div>
        ) : null}
        {settings.showCustomerPhone && data.customer ? (
          <div className="flex justify-between">
            <span>العميل</span>
            <bdi dir="ltr">{data.customer.phone}</bdi>
          </div>
        ) : null}
      </div>

      <table className="w-full text-xs tabular-nums">
        <tbody>
          {data.lines.map((l) => (
            <tr key={l.id} className="align-top">
              <td className="py-0.5">
                {l.label}
                <div className="text-[9pt]">
                  {plainNumber(l.qty)} × {n(l.unitPriceSdg)}
                  {dec(l.lineDiscountSdg).gt(0) ? ` − ${n(l.lineDiscountSdg)}` : ""}
                </div>
              </td>
              <td className="py-0.5 text-end">{n(l.amountSdg)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="flex flex-col border-t border-dashed border-black pt-1 text-xs tabular-nums">
        {dec(data.discountSdg).gt(0) ? (
          <>
            <div className="flex justify-between">
              <dt>المجموع</dt>
              <dd>{n(data.subtotalSdg)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>الخصم</dt>
              <dd>−{n(data.discountSdg)}</dd>
            </div>
          </>
        ) : null}
        <div className="flex justify-between text-base font-bold">
          <dt>الإجمالي</dt>
          <dd>{n(data.totalSdg)} ج.س</dd>
        </div>
        {data.payments.map((p) => (
          <div key={p.method} className="flex justify-between">
            <dt>{p.method === "CASH" ? "نقداً" : `بنكك${p.reference ? ` (${p.reference})` : ""}`}</dt>
            <dd>{n(p.amountSdg)}</dd>
          </div>
        ))}
        {data.cashTenderedSdg ? (
          <>
            <div className="flex justify-between">
              <dt>المستلم</dt>
              <dd>{n(data.cashTenderedSdg)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>الباقي</dt>
              <dd>{n(data.changeSdg)}</dd>
            </div>
          </>
        ) : null}
      </dl>

      {settings.footer ? (
        <p className="whitespace-pre-line border-t border-dashed border-black pt-1 text-center text-xs">
          {settings.footer}
        </p>
      ) : null}
    </article>
  );
}
