import { NextRequest } from "next/server";
import { searchCatalog } from "@/lib/comp/catalog-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const jobViews = new Set(["saved-jobs", "applied-jobs", "archived-jobs"]);

export async function GET(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams);
  params.set("group", "companies");
  if (!jobViews.has(params.get("tab") || "")) params.set("tab", "saved-jobs");
  return searchCatalog(params);
}

export async function POST(request: NextRequest) {
  try {
    if (Number(request.headers.get("content-length")) > 300_000)
      return Response.json({ error: "Job request is too large." }, { status: 413 });
    const body = await request.json();
    const params = new URLSearchParams();
    const tab = typeof body.tab === "string" && jobViews.has(body.tab)
      ? body.tab
      : "saved-jobs";
    params.set("group", "companies");
    params.set("tab", tab);
    for (const key of ["page", "pageSize", "query"])
      if (["string", "number"].includes(typeof body[key]))
        params.set(key, String(body[key]));
    if (Array.isArray(body.savedJobs))
      params.set("savedJobs", JSON.stringify(body.savedJobs.slice(0, 1000)));
    return await searchCatalog(params);
  } catch {
    return Response.json({ error: "Invalid saved jobs request." }, { status: 400 });
  }
}
