import { roleCan } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";
import { getExpenseAttachment } from "@/lib/expenses";
import { privateImageResponse } from "@/lib/private-images";

/** صورة فاتورة مصروف: للمالك والمديرة، أو لمن سجّلته — لا تُخزَّن مؤقتاً خارج المتصفح. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const expense = await getExpenseAttachment((await params).id);
  const allowed =
    !!expense?.attachmentKey &&
    (roleCan(session.user.role, { expense: ["read"] }) || expense.createdById === session.user.id);
  if (!allowed || !expense.attachmentKey) return new Response("Not found", { status: 404 });
  return privateImageResponse(expense.attachmentKey);
}
