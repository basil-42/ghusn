import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold", {
  variants: {
    variant: {
      default: "bg-muted text-foreground",
      success: "bg-sage/15 text-muted-foreground",
      warning: "bg-gold/15 text-warning",
      destructive: "bg-destructive/10 text-destructive",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
