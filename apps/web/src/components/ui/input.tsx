import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "min-h-12 w-full min-w-0 rounded-xl border border-input bg-card px-4 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

/** قائمة منسدلة أصلية — أفضل على الجوال من القوائم المخصّصة. */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "min-h-12 w-full min-w-0 rounded-xl border border-input bg-card px-4 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        className,
      )}
      {...props}
    />
  );
}
