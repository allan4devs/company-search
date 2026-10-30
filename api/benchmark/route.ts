import { getDb } from "@/lib/helpers/mongodb";
import { COLLECTIONS } from "@/lib/constants/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
