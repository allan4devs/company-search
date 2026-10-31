import { NextRequest, NextResponse } from "next/server";
import { getCategories, getCompanies, getPreferences, savePreference, SHARED_COMPANY_PREFERENCES_OWNER_ID } from "@/lib/comp/store";
import { validatePreference } from "@/lib/comp/types";
import { companies as catalogCompanies } from "@/lib/comp/companies";
import { COMPANY_CATEGORIES, companyCategoryKeys } from "@/lib/comp/categories";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const [companies, categories, preferences] = await Promise.all([
      getCompanies(),
      getCategories(),
      getPreferences(SHARED_COMPANY_PREFERENCES_OWNER_ID),
    ]);
    return NextResponse.json({ companies, categories, preferences, ownerId: SHARED_COMPANY_PREFERENCES_OWNER_ID, canSync: true, storage: "mongodb" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    // Keep the researched directory usable before a database connection is configured.
    // The browser keeps working, while the client reports that shared sync is unavailable.
    return NextResponse.json({ companies: catalogCompanies.map(company => ({ ...company, categories: companyCategoryKeys(company) })), categories: COMPANY_CATEGORIES, preferences: {}, ownerId: SHARED_COMPANY_PREFERENCES_OWNER_ID, canSync: false, storage: "catalog" }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
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
        savePreference(SHARED_COMPANY_PREFERENCES_OWNER_ID, companyKey, preference, importOnly),
      ));
    }
    return NextResponse.json({ ownerId: SHARED_COMPANY_PREFERENCES_OWNER_ID, preferences: await getPreferences(SHARED_COMPANY_PREFERENCES_OWNER_ID) });
  } catch { return NextResponse.json({ error: "Changes could not be saved. Please retry." }, { status: 503 }); }
}
