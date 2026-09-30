"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ disabled }: { disabled: boolean }) {
  return (
    <Button type="button" disabled={disabled} onClick={() => window.print()}>
      <Printer aria-hidden /> طباعة
    </Button>
  );
}
