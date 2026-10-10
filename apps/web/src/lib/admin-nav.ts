import type { NavIcon, NavModel, NavSection, QuickAction } from "./admin-nav-model";
import { roleCan } from "./auth/permissions";

export { NAV_COOKIE, activeSection } from "./admin-nav-model";
export type { NavModel, NavSection, QuickAction } from "./admin-nav-model";

/**
 * قائمة الإدارة (D-119): مجموعات بعناوين، وكل رابط «قسم» قد يضم صفحات شقيقة تظهر تبويبات أعلى الصفحة.
 * الرابط يظهر إن كان للدور صلاحية أي من صفحاته، ويذهب لأول صفحة مسموحة. لا صلاحيات هنا تُفحص للحماية —
 * كل صفحة تفحص صلاحيتها بنفسها (requirePermission)؛ هذا للعرض فقط.
 */

type Permissions = Parameters<typeof roleCan>[1];

interface Page {
  href: string;
  label: string;
  permission?: Permissions;
}

interface Section {
  key: string;
  label: string;
  icon: NavIcon;
  /** الصفحات بالترتيب؛ أكثر من صفحة = تبويبات */
  pages: Page[];
  /** شارة عدد حيّة (يحدّثها الجرس) */
  badge?: "orders";
  /** الاسم حين لا يرى الدور كل صفحات القسم (الموظفة: «المنتجات» بلا الأسعار) */
  partialLabel?: string;
}

interface Group {
  label: string | null;
  sections: Section[];
}

const GROUPS: Group[] = [
  {
    label: null,
    sections: [{ key: "home", label: "الرئيسية", icon: "dashboard", pages: [{ href: "/admin", label: "الرئيسية" }] }],
  },
  {
    label: "البيع",
    sections: [
      {
        key: "pos",
        label: "نقطة البيع",
        icon: "pos",
        pages: [{ href: "/pos", label: "نقطة البيع", permission: { pos: ["sell"] } }],
      },
      {
        key: "orders",
        label: "طلبات المتجر",
        icon: "orders",
        badge: "orders",
        pages: [{ href: "/admin/orders", label: "طلبات المتجر", permission: { order: ["read"] } }],
      },
      {
        key: "sales",
        label: "المبيعات والمرتجعات",
        icon: "sales",
        pages: [{ href: "/admin/sales", label: "المبيعات", permission: { sale: ["read"] } }],
      },
      {
        key: "customers",
        label: "العملاء",
        icon: "customers",
        pages: [{ href: "/admin/customers", label: "العملاء", permission: { customer: ["read"] } }],
      },
    ],
  },
  {
    label: "المخزون والمشتريات",
    sections: [
      {
        key: "catalog",
        label: "المنتجات والأسعار",
        partialLabel: "المنتجات",
        icon: "products",
        pages: [
          { href: "/admin/products", label: "المنتجات", permission: { product: ["read"] } },
          { href: "/admin/pricing", label: "الأسعار", permission: { price: ["approve"] } },
          { href: "/admin/labels", label: "الملصقات", permission: { product: ["read"] } },
        ],
      },
      {
        key: "stock",
        label: "المخزون والجرد",
        icon: "stock",
        pages: [{ href: "/admin/stock", label: "المخزون", permission: { stock: ["read"] } }],
      },
      {
        key: "purchasing",
        label: "الشحنات والموردون",
        icon: "shipments",
        pages: [
          { href: "/admin/shipments", label: "الشحنات", permission: { shipment: ["read"] } },
          { href: "/admin/suppliers", label: "الموردون", permission: { supplier: ["read"] } },
        ],
      },
    ],
  },
  {
    label: "المال",
    sections: [
      {
        key: "expenses",
        label: "المصاريف",
        icon: "expenses",
        pages: [{ href: "/admin/expenses", label: "المصاريف", permission: { expense: ["create"] } }],
      },
      {
        key: "wallets",
        label: "المحافظ والتمويل",
        partialLabel: "المحافظ",
        icon: "wallets",
        pages: [
          { href: "/admin/wallets", label: "المحافظ", permission: { wallet: ["update"] } },
          { href: "/admin/capital", label: "التمويل", permission: { capital: ["update"] } },
        ],
      },
      {
        key: "rates",
        label: "سعر الصرف",
        icon: "rates",
        pages: [{ href: "/admin/exchange-rates", label: "سعر الصرف", permission: { exchangeRate: ["read"] } }],
      },
    ],
  },
  {
    label: "التقارير",
    sections: [
      {
        key: "reports",
        label: "التقرير الشهري",
        icon: "reports",
        pages: [{ href: "/admin/reports", label: "التقرير الشهري", permission: { report: ["read"] } }],
      },
      {
        key: "insights",
        label: "التحليلات",
        icon: "insights",
        pages: [{ href: "/admin/insights", label: "التحليلات", permission: { report: ["read"], cost: ["read"] } }],
      },
    ],
  },
  {
    label: "المتجر الإلكتروني",
    sections: [
      {
        key: "storefront",
        label: "واجهة المتجر",
        icon: "store",
        pages: [
          { href: "/admin/banners", label: "البانرات", permission: { settings: ["update"] } },
          { href: "/admin/occasions", label: "المناسبات", permission: { category: ["update"] } },
          { href: "/admin/wrapping", label: "التغليف", permission: { settings: ["update"] } },
          { href: "/admin/categories", label: "الأقسام", permission: { category: ["update"] } },
        ],
      },
    ],
  },
];

/** أسفل القائمة */
const FOOTER: Section = {
  key: "admin",
  label: "الإعدادات",
  icon: "settings",
  pages: [
    { href: "/admin/settings", label: "الضبط", permission: { settings: ["update"] } },
    { href: "/admin/users", label: "المستخدمون", permission: { user: ["list"] } },
    { href: "/admin/audit", label: "سجل التدقيق", permission: { audit: ["read"] } },
  ],
};

function visible(section: Section, role: unknown): NavSection | null {
  const pages = section.pages.filter((p) => !p.permission || roleCan(role, p.permission));
  const first = pages[0];
  if (!first) return null;
  return {
    key: section.key,
    label: pages.length < section.pages.length && section.partialLabel ? section.partialLabel : section.label,
    icon: section.icon,
    href: first.href,
    badge: section.badge,
    pages: pages.map(({ href, label }) => ({ href, label })),
  };
}

/** القائمة كما يراها الدور: المجموعات الفارغة تختفي. بيانات بسيطة تُمرَّر للمتصفح. */
export function navFor(role: unknown): NavModel {
  return {
    groups: GROUPS.map((g) => ({
      label: g.label,
      sections: g.sections.map((s) => visible(s, role)).filter((s): s is NavSection => s !== null),
    })).filter((g) => g.sections.length > 0),
    footer: visible(FOOTER, role),
  };
}

/** زر «+ جديد»: أكثر ما يُنشأ يومياً، حسب الصلاحية. */
export function quickActionsFor(role: unknown): QuickAction[] {
  const all: (QuickAction & { permission: Permissions })[] = [
    { href: "/pos", label: "بيع جديد", permission: { pos: ["sell"] } },
    { href: "/admin/expenses#new", label: "مصروف", permission: { expense: ["create"] } },
    { href: "/admin/stock/adjustments/new", label: "تسوية مخزون", permission: { stock: ["adjust"] } },
    { href: "/admin/products/new", label: "منتج", permission: { product: ["create"] } },
    { href: "/admin/shipments/new", label: "شحنة", permission: { shipment: ["create"] } },
    { href: "/admin/exchange-rates", label: "سعر الجنيه لليوم", permission: { exchangeRate: ["update"] } },
  ];
  return all.filter((a) => roleCan(role, a.permission)).map(({ href, label }) => ({ href, label }));
}
