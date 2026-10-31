import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/admin-auth";
import { copyPreferencesToOwner, getPreferences, SHARED_COMPANY_PREFERENCES_OWNER_ID } from "@/lib/comp/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = getAdminFromRequest(request);
  try {
    if (admin) await copyPreferencesToOwner(admin.id, SHARED_COMPANY_PREFERENCES_OWNER_ID);
    const preferences = await getPreferences(SHARED_COMPANY_PREFERENCES_OWNER_ID);
    return NextResponse.json({ canSync: true, ownerId: SHARED_COMPANY_PREFERENCES_OWNER_ID, preferences }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ canSync: false, ownerId: SHARED_COMPANY_PREFERENCES_OWNER_ID, preferences: {}, error: "Shared preferences could not be loaded." }, { status: 503 });
  }
}
