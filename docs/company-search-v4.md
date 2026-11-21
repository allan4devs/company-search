# Company search V4

V4 is a script-only, name-first workflow. It does not browse public sources, run search queries, contact job boards, or import records. Allan runs searches and supplies the resulting company names.

## 1. Export the current Mongo company-name list

```powershell
node scripts/v4-company-names.mjs
```

This reads `comp_companies` once and writes a JSON array to `company-batches/v4-company-names.json`. The array contains canonical company names and stored aliases only. Set `MONGODB_URI` and optionally `MONGODB_DB` in the environment first.

Refresh this snapshot before deduplicating each new batch.

## 2. Track search pages

Keep using the same exact query string so its progress stays together:

```powershell
node scripts/v4-search-pages.mjs next "software developer engineer LATAM Costa Rica full stack backend frontend"
node scripts/v4-search-pages.mjs status "software developer engineer LATAM Costa Rica full stack backend frontend"
```

`next` advances one page by default. If a search result starts at another page, record it directly with `--page 15`. State is local in `company-batches/v4/search-pages.json`.

## 3. Deduplicate a manually collected batch

Save the results as a JSON array of names, or an object with a `companies`, `candidates`, or `leads` array. Then run:

```powershell
node scripts/v4-dedupe-company-names.mjs company-batches/v4/search-page-15.json
```

The script compares normalized names with the exported Mongo snapshot and removes repeats within the incoming batch. It writes a JSON array containing only new names. No Mongo writes or imports occur. The name-only output is a discovery list, not an import-ready company record; enrich it later if you decide to add those companies.

To combine several lead files, take the first N names, and save per-step elapsed times, use:

```powershell
node scripts/v4-select-new-companies.mjs leads-a.json leads-b.json --limit 10 --out company-batches/v4/new-company-names.json
```

The timing JSON is written beside the output with `-timing` appended to its filename.

To add a name-only batch to Mongo with the `new` tag after reviewing it, run:

```powershell
node --env-file=.env scripts/v4-upload-company-names.mjs company-batches/v4/new-company-names.json v4-names-YYYY-MM-DD
```

This inserts pending name-only records or tags an exact normalized name match. It does not claim the employers' U.S. location or verify individual postings.

Search focus: U.S. employers that hire software engineers in Costa Rica or Latin America, especially full-stack, backend, and frontend roles. Likes and saved jobs in The Comp are the reference for choosing similar employers. Public company lists and contract records can provide names to investigate, but V4 does not fetch or verify them.
