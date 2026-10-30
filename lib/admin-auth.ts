import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { resolveRuntimeSecret } from "./security/runtime-secret";

export const ADMIN_COOKIE = "b2b_admin_token";

export type AdminTokenPayload = {
  id: string;
  username: string;
};

function adminSecret() {
  return resolveRuntimeSecret(
    "ADMIN_JWT_SECRET",
    process.env.ADMIN_JWT_SECRET,
    "development-only-admin-jwt-secret",
  );
}

export function signAdminToken(payload: AdminTokenPayload, expiresIn = "12h") {
  return jwt.sign(payload, adminSecret(), { expiresIn } as jwt.SignOptions);
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    const decoded = jwt.verify(token, adminSecret());
    if (typeof decoded === "string" || !decoded) return null;
    const { id, username } = decoded as Partial<AdminTokenPayload>;
    return id && username ? { id, username } : null;
  } catch {
    return null;
  }
}

export function getAdminFromRequest(request: NextRequest): AdminTokenPayload | null {
  const bearer = request.headers.get("authorization");
  const token = request.cookies.get(ADMIN_COOKIE)?.value
    ?? (bearer?.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : undefined);

  return token ? verifyAdminToken(token) : null;
}
