import type { ComponentProps } from "react";

// مكوّنات واجهة بسيطة بألوان الهوية. أهداف لمس ≥ 44px (CLAUDE.md — شاشات الموظفات).

export function Field({ label, error, ...props }: ComponentProps<"input"> & { label: string; error?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      <input
        {...props}
        className="min-h-12 w-full min-w-0 rounded-xl border border-line bg-white px-4 text-base outline-none focus:border-sage focus:ring-2 focus:ring-sage/30"
      />
      {error ? <span className="text-sm text-danger">{error}</span> : null}
    </label>
  );
}

export function Select({ label, children, ...props }: ComponentProps<"select"> & { label: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      <select
        {...props}
        className="min-h-12 w-full min-w-0 rounded-xl border border-line bg-white px-4 text-base outline-none focus:border-sage focus:ring-2 focus:ring-sage/30"
      >
        {children}
      </select>
    </label>
  );
}

export function Button({
  variant = "primary",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "ghost" }) {
  const styles =
    variant === "primary"
      ? "bg-forest text-ivory hover:bg-forest/90"
      : "border border-line bg-white text-forest hover:bg-ivory";
  return (
    <button
      {...props}
      className={`min-h-11 rounded-xl px-5 font-semibold transition disabled:opacity-60 ${styles} ${props.className ?? ""}`}
    />
  );
}

export function Alert({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const styles = tone === "error" ? "border-danger/30 text-danger" : "border-sage/40 text-sage";
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border bg-white px-4 py-3 text-sm ${styles}`}
    >
      {children}
    </p>
  );
}
