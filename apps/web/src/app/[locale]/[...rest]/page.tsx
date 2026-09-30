import { notFound } from "next/navigation";

// أي رابط غير معروف داخل المتجر ← صفحة «غير موجودة» بقالب المتجر ولغته
export default function CatchAll() {
  notFound();
}
