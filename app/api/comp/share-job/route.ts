import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { CompanyJob } from "@/lib/comp/catalog";
import { saveSharedJob } from "@/lib/comp/shared-jobs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (
      typeof body.companyName !== "string" ||
      !body.companyName.trim() ||
      body.companyName.length > 200 ||
      !body.job ||
      typeof body.job !== "object" ||
      typeof body.job.title !== "string" ||
      typeof body.job.url !== "string" ||
      typeof body.job.location !== "string"
    ) {
      return NextResponse.json({ error: "A company and valid job are required." }, { status: 400 });
    }
    const target = new URL(body.job.url);
    if (!/^https?:$/.test(target.protocol) || target.username || target.password)
      return NextResponse.json({ error: "The job link must use HTTP or HTTPS." }, { status: 400 });
    const job: CompanyJob = {
      id: String(body.job.id || "").slice(0, 160),
      title: body.job.title.slice(0, 200),
      url: target.href,
      location: body.job.location.slice(0, 200),
      workMode: typeof body.job.workMode === "string" ? body.job.workMode.slice(0, 100) : "",
      listingStatus: typeof body.job.listingStatus === "string" ? body.job.listingStatus.slice(0, 100) : "",
      sourceNotes: typeof body.job.sourceNotes === "string" ? body.job.sourceNotes.slice(0, 500) : "",
    };
    const id = randomUUID();
    await saveSharedJob(id, body.companyName.trim(), job);
    return NextResponse.json({ id }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not create a public job link." }, { status: 500 });
  }
}
