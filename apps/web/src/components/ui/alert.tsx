import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "flex items-start gap-3 rounded-xl border bg-card px-4 py-3 text-sm [&_svg]:mt-0.5 [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "border-border",
        success: "border-sage/40 text-muted-foreground",
        warning: "border-gold/40 bg-gold/5 text-warning",
        destructive: "border-destructive/30 text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Alert({ className, variant, ...props }: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={variant === "destructive" || variant === "warning" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}
