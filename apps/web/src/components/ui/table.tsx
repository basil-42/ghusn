import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-border bg-card">
      <table data-slot="table" className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader(props: ComponentProps<"thead">) {
  return <thead data-slot="table-header" className="bg-muted/60" {...props} />;
}

export function TableBody(props: ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={cn("border-b border-border last:border-0", className)} {...props} />;
}

export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn("whitespace-nowrap px-4 py-3 text-start font-semibold text-muted-foreground", className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return <td data-slot="table-cell" className={cn("whitespace-nowrap px-4 py-3", className)} {...props} />;
}
