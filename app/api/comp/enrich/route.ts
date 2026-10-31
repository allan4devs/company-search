import { NextRequest, NextResponse } from "next/server";
import { parseCompanyEnrichmentBatch, type CompanyEnrichmentBatch } from "@/lib/comp/enrichment";
import { upsertCompanyEnrichments } from "@/lib/comp/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });

  let batch: CompanyEnrichmentBatch;
  try {
    const text = await request.text();
    if (text.length > 2_000_000) return NextResponse.json({ error: "Company batch is too large." }, { status: 413 });
    batch = parseCompanyEnrichmentBatch(JSON.parse(text));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Send a valid company batch." }, { status: 400 });
  }

  try {
    const result = await upsertCompanyEnrichments(batch.companies, batch.batchId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Company data could not be saved. Check MongoDB configuration and retry." }, { status: 503 });
  }
}
