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
  }),
  // المديرة: سعر الصرف والهوامش (D-29) وترى التكاليف
  MANAGER: ac.newRole({
    exchangeRate: ["read", "update"],
    margin: ["read", "update"],
    cost: ["read"],
  }),
  // الموظفة: ترى سعر الصرف فقط، ولا ترى التكاليف ولا الهوامش (system-design §4.9)
  STAFF: ac.newRole({
    exchangeRate: ["read"],
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
