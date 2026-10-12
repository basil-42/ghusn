import { readStatementToken, statementFile } from "@/lib/partners";

/**
 * رابط الكشف المرسل للشريك على واتساب (D-130): يفتح الـ PDF كما صدر، صالح 7 أيام، بلا تسجيل دخول.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const id = readStatementToken((await params).token);
  const file = id ? await statementFile(id) : null;
  if (!file) {
    return new Response("انتهت صلاحية الرابط أو أنه غير صحيح — اطلب رابطاً جديداً.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
    });
  }
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
