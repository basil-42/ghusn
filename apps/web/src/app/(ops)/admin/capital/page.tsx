import { redirect } from "next/navigation";

/** «التمويل» صار جزءاً من صفحة «المال» (D-144). */
export default function CapitalPage() {
  redirect("/admin/wallets#money-in");
}
