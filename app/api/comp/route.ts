import { NextRequest, NextResponse } from "next/server";
import { getCategories, getCompanies, getPreferences, savePreference } from "@/lib/comp/store";
import { validatePreference } from "@/lib/comp/types";
import { getAdminFromRequest } from "@/lib/admin-auth";
import { companies as catalogCompanies } from "@/lib/comp/companies";
import { COMPANY_CATEGORIES, companyCategoryKeys } from "@/lib/comp/categories";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const admin = getAdminFromRequest(request);
    const [companies, categories] = await Promise.all([getCompanies(), getCategories()]);
    return NextResponse.json({ companies, categories, preferences: admin ? await getPreferences(admin.id) : {}, canEdit: !!admin, storage: "mongodb" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    // Keep the researched directory usable before a database connection is configured.
    // Saving remains disabled; this does not claim that account preferences were loaded.
    return NextResponse.json({ companies: catalogCompanies.map(company => ({ ...company, categories: companyCategoryKeys(company) })), categories: COMPANY_CATEGORIES, preferences: {}, canEdit: false, storage: "catalog" }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
export async function PUT(request: NextRequest) {
  const admin = getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Sign in as admin to save company preferences." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  let changes: [string, ReturnType<typeof validatePreference>][];
  let importOnly = false;
  try {
    const text = await request.text();
    if (text.length > 300000) throw new Error("Request too large.");
    const body = JSON.parse(text);
    importOnly = body.importOnly === true;
    if (!body.preferences || typeof body.preferences !== "object" || Array.isArray(body.preferences)) throw new Error("Invalid preferences.");
    const entries = Object.entries(body.preferences);
    if (!entries.length || entries.length > 2000) throw new Error("Invalid preference count.");
    changes = entries.map(([key, value]) => [key, validatePreference(value)]);
  } catch { return NextResponse.json({ error: "Send valid company preferences and HTTP(S) careers links." }, { status: 400 }); }
  try {
    const companies = await getCompanies();
    const aliases = new Map(companies.flatMap(company => [company.key, ...(company.legacyKeys || [])].map(key => [key, company.key] as const)));
    if (changes.some(([key]) => !aliases.has(key))) return NextResponse.json({ error: "Unknown company." }, { status: 400 });
    const writes = changes.map(([key, preference]) => [aliases.get(key)!, preference] as const);
    const batchSize = 32;
    for (let start = 0; start < writes.length; start += batchSize) {
      await Promise.all(writes.slice(start, start + batchSize).map(([companyKey, preference]) =>
        savePreference(admin.id, companyKey, preference, importOnly),
      ));
    }
    return NextResponse.json({ preferences: await getPreferences(admin.id) });
  } catch { return NextResponse.json({ error: "Changes could not be saved. Please retry." }, { status: 503 }); }
}
