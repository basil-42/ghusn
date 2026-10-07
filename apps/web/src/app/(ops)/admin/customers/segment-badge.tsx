import { CUSTOMER_SEGMENT_LABELS, type CustomerSegment } from "@ghusn/core";
import { cn } from "@/lib/utils";

const STYLES: Record<CustomerSegment, string> = {
  VIP: "bg-gold/20 text-warning",
  REPEAT: "bg-sage/20 text-muted-foreground",
  NEW: "bg-muted text-muted-foreground",
};

export function SegmentBadge({ segment, className }: { segment: CustomerSegment | null; className?: string }) {
  if (!segment) return null;
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-xs font-bold", STYLES[segment], className)}>
      {CUSTOMER_SEGMENT_LABELS[segment]}
    </span>
  );
}

/** wa.me بالرقم فقط — المحادثة تُفتح من واتساب المحل على الجهاز. */
export const whatsappChatUrl = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;
