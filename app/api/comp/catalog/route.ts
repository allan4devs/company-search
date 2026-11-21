import { NextRequest } from "next/server";
import { searchCatalog } from "@/lib/comp/catalog-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return searchCatalog(request.nextUrl.searchParams);
}

export async function POST(request: NextRequest) {
  try {
    if (Number(request.headers.get("content-length")) > 300_000)
      return Response.json({ error: "Search request is too large." }, { status: 413 });
    const body = await request.json();
    const params = new URLSearchParams();
    for (const key of [
      "group", "tab", "page", "pageSize", "query", "latamCostaRicaFilter",
      "hideWithoutDomain", "country", "technology", "role", "level", "region",
      "researchOnly", "fastPageOnly",
    ]) {
      if (["string", "number", "boolean"].includes(typeof body[key]))
        params.set(key, String(body[key]));
    }
    for (const key of ["liked", "disliked", "archived"])
      if (Array.isArray(body[key]))
        for (const value of body[key].slice(0, 1000))
          if (typeof value === "string" && value.length <= 160) params.append(key, value);
    if (Array.isArray(body.savedJobs))
      params.set("savedJobs", JSON.stringify(body.savedJobs.slice(0, 1000)));
    return await searchCatalog(params);
  } catch {
    return Response.json({ error: "Invalid company search request." }, { status: 400 });
  }
}
