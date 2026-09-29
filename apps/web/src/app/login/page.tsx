import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "تسجيل الدخول | غصن" };

export default async function LoginPage() {
  if (await getSession()) redirect("/admin");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-3">
          <Image src="/brand/logo-vertical-forest.svg" alt="غصن" width={160} height={160} priority />
          <p className="text-sage">لوحة إدارة المحل</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
