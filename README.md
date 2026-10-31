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

Follow [COMPANY_SEARCH_PROFILE.md](./COMPANY_SEARCH_PROFILE.md) for the dedupe-first discovery and evidence workflow. Large JSON files can be previewed and imported in safe chunks; the importer honors the endpoint's 100-company limit, stays below the request-size limit, retries temporary failures, and can be rerun safely after an interrupted upload.

```powershell
$env:COMPANY_IMPORT_BASE_URL = "https://your-app.example"
node scripts/import-company-batches.mjs .\company-batch.json --dry-run
node scripts/import-company-batches.mjs .\company-batch.json
```

The `POST /api/comp/enrich` endpoint validates source and job URLs, upserts repeated companies by domain or normalized name, and preserves prior evidence. Mongo-backed batches appear in the catalog when MongoDB is configured; the bundled catalog remains available as a fallback.

## Checks

```bash
npm run lint
npm run build
```
