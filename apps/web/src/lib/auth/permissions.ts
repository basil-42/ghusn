import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

/**
 * الصلاحيات التفصيلية (D-62). كل شاشة وعملية تفحص «صلاحية» وليس اسم الدور،
 * حتى يمكن إضافة أدوار لاحقاً (مغلّف، مندوب) بتعريف صلاحياتها فقط.
 */
export const statements = {
  ...defaultStatements,
  exchangeRate: ["read", "update"],
  margin: ["read", "update"],
  cost: ["read"],
  product: ["read", "create", "update", "delete"],
  category: ["create", "update"],
  supplier: ["read", "create", "update"],
  supplierPayment: ["create", "void"],
  shipment: ["read", "create", "update", "receive"],
  shipmentCost: ["create", "void"],
  stock: ["read"],
  price: ["approve"],
  pos: ["sell", "approve"],
  sale: ["read"],
  settings: ["update"],
  expense: ["read", "create", "void"],
  report: ["read"],
  capital: ["update"],
  wallet: ["update"],
  order: ["read", "update", "cancel", "payment"],
} as const;

export const ac = createAccessControl(statements);

export const roles = {
  // المالك: كل شيء عدا الحذف النهائي (الإيقاف بدل الحذف) وانتحال الحسابات
  OWNER: ac.newRole({
    user: ["create", "list", "set-role", "ban", "set-password", "get", "update"],
    session: ["list", "revoke"],
    exchangeRate: ["read", "update"],
    margin: ["read", "update"],
    cost: ["read"],
    product: ["read", "create", "update", "delete"],
    category: ["create", "update"],
    supplier: ["read", "create", "update"],
    supplierPayment: ["create", "void"],
    shipment: ["read", "create", "update", "receive"],
    shipmentCost: ["create", "void"],
    stock: ["read"],
    price: ["approve"],
    pos: ["sell", "approve"],
    sale: ["read"],
    settings: ["update"],
    expense: ["read", "create", "void"],
    report: ["read"],
    capital: ["update"],
    // المحافظ: الأرصدة والتحويلات والتسويات — للمالك فقط (D-86)
    wallet: ["update"],
    order: ["read", "update", "cancel", "payment"],
  }),
  // المديرة: سعر الصرف والهوامش (D-29) وترى التكاليف، وتدير الكتالوج (D-69)
  MANAGER: ac.newRole({
    exchangeRate: ["read", "update"],
    margin: ["read", "update"],
    cost: ["read"],
    product: ["read", "create", "update", "delete"],
    category: ["create", "update"],
    supplier: ["read", "create", "update"],
    supplierPayment: ["create", "void"],
    shipment: ["read", "create", "update", "receive"],
    shipmentCost: ["create", "void"],
    stock: ["read"],
    price: ["approve"],
    pos: ["sell", "approve"],
    sale: ["read"],
    expense: ["read", "create", "void"],
    report: ["read"],
    // طلبات المتجر: التجهيز والتسليم والإلغاء (D-88)
    order: ["read", "update", "cancel", "payment"],
  }),
  // الموظفة: ترى سعر الصرف فقط، ولا ترى التكاليف ولا الهوامش (system-design §4.9)
  STAFF: ac.newRole({
    exchangeRate: ["read"],
    product: ["read"],
    stock: ["read"],
    // تبيع وتخصم حتى الحد وتفتح ورديتها وتغلقها (D-80)
    pos: ["sell"],
    // مصاريف الأقسام المسموحة لها فقط، من درج الوردية وحتى الحد (D-83)
    expense: ["create"],
    // تجهّز الطلبات وتسلّمها؛ الإلغاء للمديرة والمالك
    order: ["read", "update"],
  }),
};

export type RoleName = keyof typeof roles;
export const ROLE_NAMES = Object.keys(roles) as RoleName[];

export const ROLE_LABELS: Record<RoleName, string> = {
  OWNER: "المالك",
  MANAGER: "مديرة",
  STAFF: "موظفة",
};

type Permissions = { [K in keyof typeof statements]?: (typeof statements)[K][number][] };

export function isRoleName(value: unknown): value is RoleName {
  return typeof value === "string" && value in roles;
}

/** هل يملك الدور هذه الصلاحيات؟ (فحص محلي بلا قاعدة بيانات) */
export function roleCan(role: unknown, permissions: Permissions): boolean {
  if (!isRoleName(role)) return false;
  return roles[role].authorize(permissions).success;
}
