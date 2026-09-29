"use client";

import { Button } from "@/components/ui/button";

/** زر إرسال يطلب تأكيداً قبل عملية لا يُرجع عنها بسهولة. */
export function ConfirmButton({ message, children }: { message: string; children: React.ReactNode }) {
  return (
    <Button
      type="submit"
      variant="outline"
      className="text-destructive"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
