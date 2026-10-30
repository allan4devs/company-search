import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/admin-auth";
import { getPreferences } from "@/lib/comp/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ canEdit: false, preferences: {} }, { headers: { "Cache-Control": "private, no-store" } });
  try {
    const preferences = await getPreferences(admin.id);
    return NextResponse.json({ canEdit: true, preferences }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ canEdit: false, preferences: {}, error: "Admin preferences could not be loaded." }, { status: 503 });
  }
}
