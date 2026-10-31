import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const MAX_COMPANIES_PER_REQUEST = 100;
const MAX_REQUEST_BYTES = 1_800_000;
const MAX_ATTEMPTS = 4;

function usage() {
  console.log("Usage: node scripts/import-company-batches.mjs <batch.json> [--dry-run]");
  console.log("Set COMPANY_IMPORT_BASE_URL to the app origin before importing.");
}

function batchIdFor(baseId, index) {
  return `${baseId.slice(0, 112)}-p${String(index + 1).padStart(3, "0")}`;
}

function serializeBatch(batchId, companies) {
  return JSON.stringify({ batchId, companies });
}

function batchBytes(batchId, companies) {
  return Buffer.byteLength(serializeBatch(batchId, companies), "utf8");
}

function splitIntoBatches(companies, baseId) {
  const batches = [];
  let current = [];

  for (const company of companies) {
    const candidate = [...current, company];
    const nextBatchId = batchIdFor(baseId, batches.length);
    const isWithinLimits = candidate.length <= MAX_COMPANIES_PER_REQUEST
      && batchBytes(nextBatchId, candidate) <= MAX_REQUEST_BYTES;

    if (isWithinLimits) {
      current = candidate;
      continue;
    }

    if (!current.length) {
      throw new Error(`One company record exceeds the ${MAX_REQUEST_BYTES.toLocaleString()} byte request limit.`);
    }

    batches.push(current);
    current = [company];
    if (batchBytes(batchIdFor(baseId, batches.length), current) > MAX_REQUEST_BYTES) {
      throw new Error(`One company record exceeds the ${MAX_REQUEST_BYTES.toLocaleString()} byte request limit.`);
    }
  }

  if (current.length) batches.push(current);
  return batches.map((items, index) => ({
    batchId: batchIdFor(baseId, index),
    companies: items,
    bytes: batchBytes(batchIdFor(baseId, index), items),
  }));
}

function wait(milliseconds) {
  return new Promise(resolveWait => setTimeout(resolveWait, milliseconds));
}

async function postBatch(endpoint, batch) {
  let lastError;
  const body = serializeBatch(batch.batchId, batch.companies);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await wait(750 * 2 ** (attempt - 1));
      continue;
    }

    if (response.ok) return response.json();

    const detail = (await response.text()).slice(0, 500);
    lastError = new Error(`HTTP ${response.status}: ${detail || response.statusText}`);
    if (response.status < 500 && response.status !== 408 && response.status !== 429) throw lastError;
    if (attempt < MAX_ATTEMPTS) await wait(750 * 2 ** (attempt - 1));
  }

  throw lastError || new Error("Import failed after retries.");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.length === 0) {
    usage();
    return;
  }
  const dryRun = args.includes("--dry-run");
  const inputPath = args.find(argument => !argument.startsWith("--"));
  if (!inputPath || args.some(argument => argument.startsWith("--") && argument !== "--dry-run")) {
    usage();
    process.exitCode = 2;
    return;
  }

  const input = JSON.parse(await readFile(resolve(inputPath), "utf8"));
  if (!input || typeof input !== "object" || Array.isArray(input) || !Array.isArray(input.companies) || !input.companies.length) {
    throw new Error("The input must be a JSON object with a non-empty companies array.");
  }
  if (input.companies.some(company => !company || typeof company !== "object" || Array.isArray(company) || typeof company.name !== "string" || !company.name.trim())) {
    throw new Error("Every company record must have a non-empty name.");
  }

  const filenameId = basename(inputPath).replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const baseId = String(input.batchId || `company-import-${filenameId || "batch"}`).trim().slice(0, 112);
  if (!baseId) throw new Error("batchId cannot be empty.");

  const batches = splitIntoBatches(input.companies, baseId);
  console.log(`${input.companies.length} companies in ${batches.length} request${batches.length === 1 ? "" : "s"}.`);
  batches.forEach((batch, index) => console.log(`  ${batch.batchId}: ${batch.companies.length} companies, ${batch.bytes.toLocaleString()} bytes`));

  if (dryRun) return;

  const configuredBaseUrl = process.env.COMPANY_IMPORT_BASE_URL;
  if (!configuredBaseUrl) throw new Error("Set COMPANY_IMPORT_BASE_URL to the app origin before importing.");
  const baseUrl = new URL(configuredBaseUrl);
  if (!/^https?:$/.test(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
    throw new Error("COMPANY_IMPORT_BASE_URL must be an HTTP(S) origin without credentials.");
  }
  const endpoint = new URL("/api/comp/enrich", baseUrl.origin);

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    try {
      const result = await postBatch(endpoint, batch);
      console.log(`Imported ${index + 1}/${batches.length}: ${result.imported} records (${result.created} created, ${result.updated} updated).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Batch ${batch.batchId} failed: ${message}. Previously completed batches are safe to retry; rerun the same file.`);
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
