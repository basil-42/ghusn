import { roleCan } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";
import { getExpenseAttachment } from "@/lib/expenses";
import { storage } from "@/lib/storage";

/** صورة فاتورة مصروف: للمالك والمديرة، أو لمن سجّلته — لا تُخزَّن مؤقتاً خارج المتصفح. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const expense = await getExpenseAttachment((await params).id);
  const allowed =
    !!expense?.attachmentKey &&
    (roleCan(session.user.role, { expense: ["read"] }) || expense.createdById === session.user.id);
  if (!allowed || !expense.attachmentKey) return new Response("Not found", { status: 404 });
  const body = await storage.get(expense.attachmentKey);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
