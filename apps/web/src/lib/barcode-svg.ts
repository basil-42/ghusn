import bwipjs from "bwip-js/node";

/** نوع الرمز حسب طول الباركود: GTIN القياسي (D-71)، وإلا Code 128. */
function symbology(code: string): string {
  if (/^\d{13}$/.test(code)) return "ean13";
  if (/^\d{8}$/.test(code)) return "ean8";
  if (/^\d{12}$/.test(code)) return "upca";
  return "code128";
}

/** رسم الباركود SVG بخطوط حادة (أوضح على الطابعة الحرارية) مع الأرقام تحته. */
export function barcodeSvg(code: string): string {
  const svg = bwipjs.toSVG({
    bcid: symbology(code),
    text: code,
    height: 11,
    includetext: true,
    textxalign: "center",
    textsize: 9,
  });
  return svg.replace("<svg ", '<svg shape-rendering="crispEdges" preserveAspectRatio="xMidYMid meet" ');
}
