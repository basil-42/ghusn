"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** موافقة المديرة أو المالك على نفس الجهاز: الرقم وكلمة السر (D-80، D-81). */
export function ApprovalDialog({
  reasons,
  pending,
  onApprove,
  onCancel,
}: {
  reasons: string[];
  pending: boolean;
  onApprove: (credentials: { phone: string; password: string }) => void;
  onCancel: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div role="dialog" aria-modal className="fixed inset-0 z-50 flex items-center justify-center bg-forest/40 p-4">
      <form
        className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-card p-5 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          onApprove({ phone, password });
        }}
      >
        <h2 className="text-lg font-bold">موافقة المديرة أو المالك</h2>
        <ul className="list-disc ps-5 text-sm text-destructive">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="رقم هاتف الموافِق"
          aria-label="رقم هاتف الموافِق"
          inputMode="tel"
          dir="ltr"
          autoFocus
          required
        />
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="كلمة السر"
          aria-label="كلمة سر الموافِق"
          required
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            موافقة وإتمام
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            رجوع
          </Button>
        </div>
      </form>
    </div>
  );
}
