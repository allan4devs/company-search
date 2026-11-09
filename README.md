# Comp

A company directory for researching engineering employers, filtering role evidence, and saving likes, dislikes, and careers links.

## Run locally

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

On Windows PowerShell, use `npm.cmd` if script execution blocks `npm.ps1`:

```powershell
npm.cmd install
npm.cmd run dev
```

Open <http://localhost:3000>. The public catalog and browser-local preferences work without a database configuration.

## Shared preference sync

Shared preferences require `MONGODB_URI`. `MONGODB_DB` is optional and defaults to `lva`. Likes, dislikes, and careers links are shared with all visitors and sync across devices; without MongoDB, preferences stay in the current browser.

## Company research batches

Follow [COMPANY_SEARCH_PROFILE.md](./COMPANY_SEARCH_PROFILE.md) for the dedupe-first discovery and evidence workflow. For speed, harvest a large lead pool first and compare it locally in one pass against MongoDB, bundled catalog data, and prior batches. The deduper writes both a unique lead list and a lane-yield ledger, so low-yield search lanes can be replaced before the next cohort. Verify only the unique survivors, in 200-company slices with `scripts/verify-company-leads.mjs`; use `--offset` to continue only if needed. `scripts/shape-company-batch.mjs` applies a review manifest to the deduped survivors and carries source lanes forward; the batch preparer checks company-level evidence and geography, rejects within-batch duplicates, and applies the `new` tag. The importer honors the endpoint's 100-company limit, stays below the request-size limit, retries temporary failures, and can be rerun safely after an interrupted upload.

```powershell
node scripts/dedupe-company-candidates.mjs .\company-batches\lane-a.json .\company-batches\lane-b.json .\company-batches\lane-c.json --out .\company-batches\leads-unique.json --ledger .\company-batches\leads-dedupe-ledger.json --cohort likes-based-2026-11-06-p002 --limit 1000
node scripts/shape-company-batch.mjs .\company-batches\leads-unique.json .\company-batches\review-manifest.json --out .\company-batches\approved.json
node scripts/prepare-company-batch.mjs .\company-batches\approved.json --batch-id likes-based-2026-11-06-p002 --out .\company-batches\likes-based-2026-11-06-p002.json --limit 100
node scripts/import-company-batches.mjs .\company-batches\likes-based-2026-11-06-p002.json --dry-run
```

The **New** directory view filters on the `new` tag and includes every imported batch, including the latest one. There is no separate Latest batch browsing filter; batch-specific verification remains available to the import workflow.

The deduper accepts multiple lead files, reads all `comp_companies` documents in one Mongo query when `MONGODB_URI` is available, and compares all candidates in one local pass. It also includes bundled data and completed company batches before building normalized name/alias and root-domain indexes in memory. It records unique rates by `queryLane` and uses the active Costa Rica/LATAM liked companies as a compact profile signal; it never makes one database request per candidate. Deduplicate first, then spend research time on the unique survivors.

```powershell
$env:COMPANY_IMPORT_BASE_URL = "https://your-app.example"
node scripts/import-company-batches.mjs .\company-batch.json --dry-run
node scripts/import-company-batches.mjs .\company-batch.json
```

The `POST /api/comp/enrich` endpoint validates source and job URLs, upserts repeated companies by domain or normalized name, and preserves prior evidence. Mongo-backed batches appear in the catalog when MongoDB is configured; the bundled catalog remains available as a fallback.

## Repository structure

The company directory feature layout and staged cleanup plan are in
[docs/REPOSITORY_STRUCTURE.md](./docs/REPOSITORY_STRUCTURE.md).

## Comp algorithm

The company discovery, matching, deduplication, and preference-learning method is a product core owned by Allan, as specified by the product owner. Its source strategy, learned signals, and implementation are treated as private product IP intended for future commercialization.

See [COMP_ALGORITHM_README.md](./COMP_ALGORITHM_README.md) for the algorithm design, the timed November 7, 2026 benchmark, measured bottlenecks, and the scaling roadmap. The benchmark is an early foundation run; it does not demonstrate hundreds-of-millions scale.

## Checks

```bash
npm run lint
npm run build
```
