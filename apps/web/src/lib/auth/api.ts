import { NextResponse } from "next/server";
import { roleCan } from "./permissions";
import { getSession } from "./session";

/** للمسارات /api/v1: بلا تحويل للصفحات — 401 بلا جلسة، 403 بلا صلاحية. */
export async function apiSession(permissions: Parameters<typeof roleCan>[1]) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }) } as const;
  if (!roleCan(session.user.role, permissions)) {
    return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) } as const;
  }
  return { session } as const;
}
