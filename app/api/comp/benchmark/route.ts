import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/helpers/mongodb";
import { COLLECTIONS } from "@/lib/constants/db";
import { getAdminFromRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!getAdminFromRequest(request)) {
    return NextResponse.json({ error: "Sign in as admin to run the benchmark." }, { status: 401 });
  }
  const started = performance.now();
  const db = await getDb();
  const companies = await db.collection(COLLECTIONS.COMP_COMPANIES).aggregate([
    { $match: { "jobs.0": { $exists: true } } },
    { $project: { _id: 0, name: 1, jobs: 1 } },
    { $unwind: "$jobs" },
    { $limit: 1000 },
  ]).toArray();
  const elapsedMs = Math.round((performance.now() - started) * 10) / 10;
  return Response.json({ count: companies.length, elapsedMs }, { headers: { "Cache-Control": "no-store" } });
}
