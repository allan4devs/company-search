import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DiscoveryRun = {
  id: string;
  cohort: string;
  status: "running" | "complete" | "error";
  startedAt: string;
  finishedAt?: string;
  output: string;
  stage: string;
  error?: string;
  company?: Record<string, unknown> | null;
  report?: Record<string, unknown> | null;
  child?: ChildProcess;
};

const globalRuns = globalThis as typeof globalThis & {
  __theCompV3Runs?: Map<string, DiscoveryRun>;
};
const runs = globalRuns.__theCompV3Runs ?? (globalRuns.__theCompV3Runs = new Map());
const root = process.cwd();
const sources = [
  "fetch-alpunto-software-leads",
  "fetch-aworkado-company-leads",
  "fetch-camtic-company-leads",
  "fetch-cinde-digital-leads",
  "fetch-costa-rica-directory-leads",
  "fetch-enterprise-league-leads",
  "fetch-findremote-latam-engineering-leads",
  "fetch-globallyremote-company-leads",
  "fetch-himalayas-company-leads",
  "fetch-jobicy-regional-engineering-leads",
  "fetch-nearshore-directory-leads",
  "fetch-nearshorehub-company-leads",
  "fetch-proveedores-software-leads",
  "fetch-regional-software-leads",
];

function publicRun(run: DiscoveryRun) {
  const safeRun = { ...run };
  delete safeRun.child;
  return { ...safeRun, log: run.output.split(/\r?\n/).filter(Boolean).slice(-18) };
}

function isLocalDevelopment(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") return false;
  const host = request.nextUrl.hostname;
  if (!new Set(["localhost", "127.0.0.1", "[::1]", "::1"]).has(host)) return false;
  const origin = request.headers.get("origin");
  return !origin || new URL(origin).host === request.nextUrl.host;
}

async function readJson(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function latestSavedRun(): Promise<DiscoveryRun | null> {
  const baseDir = path.join(root, "company-batches");
  const entries = await fs.readdir(baseDir, { withFileTypes: true }).catch(() => []);
  const directories = entries.filter((entry) => entry.isDirectory() && /^v3-one-new-company-\d{4}-\d{2}-\d{2}(?:-[a-f0-9]+)?$/.test(entry.name));
  const dated = await Promise.all(directories.map(async (entry) => ({
    name: entry.name,
    modifiedAt: (await fs.stat(path.join(baseDir, entry.name))).mtime,
  })));
  const latest = dated.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())[0];
  if (!latest) return null;
  const runDir = path.join(baseDir, latest.name);
  const [batch, report, collection] = await Promise.all([
    readJson(path.join(runDir, `${latest.name}.json`)),
    readJson(path.join(runDir, "timing-report.json")),
    readJson(path.join(runDir, "collection-report.json")),
  ]);
  const companies = Array.isArray(batch?.companies) ? batch.companies : [];
  const company = (companies[0] || null) as Record<string, unknown> | null;
  return {
    id: latest.name,
    cohort: latest.name,
    status: "complete",
    startedAt: latest.modifiedAt.toISOString(),
    finishedAt: latest.modifiedAt.toISOString(),
    output: typeof collection?.error === "string" ? collection.error : "",
    stage: company ? "One verified company prepared for review" : "Search complete; no company passed every check",
    company,
    report,
  };
}

async function finishRun(run: DiscoveryRun, code: number | null, signal: NodeJS.Signals | null) {
  run.finishedAt = new Date().toISOString();
  run.status = code === 0 ? "complete" : "error";
  if (code !== 0) run.error = `Collector exited with ${signal || `code ${code}`}.`;

  const runDir = path.join(root, "company-batches", run.cohort);
  const [batch, report, strict] = await Promise.all([
    readJson(path.join(runDir, `${run.cohort}.json`)),
    readJson(path.join(runDir, "timing-report.json")),
    readJson(path.join(runDir, "strict-domain-unique-leads.json")),
  ]);
  const companies = Array.isArray(batch?.companies) ? batch.companies : [];
  const candidates = Array.isArray(strict?.candidates) ? strict.candidates : [];
  run.company = (companies[0] || candidates[0] || null) as Record<string, unknown> | null;
  run.report = report;
}

export async function GET(request: NextRequest) {
  if (!isLocalDevelopment(request)) return NextResponse.json({ error: "V3 discovery is available in local development only." }, { status: 404 });
  const requestedId = request.nextUrl.searchParams.get("id");
  let run = requestedId
    ? runs.get(requestedId)
    : [...runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!run && !requestedId) run = await latestSavedRun() || undefined;
  if (!run) return NextResponse.json({ run: null }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ run: publicRun(run) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!isLocalDevelopment(request)) return NextResponse.json({ error: "V3 discovery is available in local development only." }, { status: 404 });
  if ([...runs.values()].some((run) => run.status === "running")) {
    return NextResponse.json({ error: "A V3 discovery is already running." }, { status: 409 });
  }
  if (!process.env.MONGODB_URI) {
    return NextResponse.json({ error: "MONGODB_URI is required for a complete catalog dedupe." }, { status: 503 });
  }

  const id = randomUUID();
  const cohort = `v3-one-new-company-${new Date().toISOString().slice(0, 10)}-${id.slice(0, 8)}`;
  const run: DiscoveryRun = {
    id,
    cohort,
    status: "running",
    startedAt: new Date().toISOString(),
    output: "",
    stage: "Starting 14 source lanes",
  };
  const args = [
    path.join(root, "scripts", "collect-and-dedupe-company-leads.mjs"),
    "--source", sources.join(","),
    "--cohort", cohort,
    "--out-dir", path.join("company-batches", cohort),
    "--source-concurrency", "4",
    "--profile-resolve-concurrency", "24",
    "--resolve-concurrency", "8",
    "--verify-concurrency", "24",
    "--slice-size", "200",
    "--max-pages", "2",
    "--domain-search-budget", "60",
    "--domain-search-engine", "bing",
    "--target", "1",
    "--limit", "10000",
  ];

  try {
    const child = spawn(process.execPath, args, {
      cwd: root,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    run.child = child;
    runs.set(id, run);
    while (runs.size > 10) {
      const oldest = [...runs.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0];
      if (!oldest || oldest.status === "running") break;
      runs.delete(oldest.id);
    }
    const append = (chunk: Buffer) => {
      run.output = `${run.output}${chunk.toString("utf8")}`.slice(-24000);
      const lines = run.output.trim().split(/\r?\n/);
      run.stage = lines.at(-1)?.replace(/^\[[^\]]+\]\s*/, "") || run.stage;
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) => {
      run.status = "error";
      run.error = error.message;
      run.finishedAt = new Date().toISOString();
      run.child = undefined;
    });
    child.on("close", (code, signal) => {
      void finishRun(run, code, signal).finally(() => { run.child = undefined; });
    });
    return NextResponse.json({ run: publicRun(run) }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start discovery." }, { status: 500 });
  }
}
