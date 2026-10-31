# Company search profile

This is the working brief for future company discovery and enrichment batches. It reflects the existing directory's emphasis and should be edited as the search changes. Treat unconfirmed preferences as soft criteria; do not claim a personal preference that has not been recorded here.

## Target companies and roles

- Find employers with software engineering teams and current or recurring engineering roles.
- Prioritize full-stack, backend, and frontend product engineering. Keep adjacent engineering roles when the evidence makes them relevant; label the role clearly.
- Useful stack signals include Java/Spring, React/Next.js, TypeScript/JavaScript, Node.js, and Python. Do not reject a good employer solely because its stack is not stated.
- Include direct product employers and engineering consultancies or nearshore firms. Record the business model as `direct`, `outsourcing`, or `unknown`; do not infer it from a company name.

## Geography and work arrangement

- Prioritize roles explicitly open to Costa Rica. Also keep Latin America or worldwide remote roles when the employer's location policy supports them.
- Remote or hybrid work is useful only when the posting or employer careers source states it. “Remote” without country eligibility remains unverified.
- Keep the source's location wording and distinguish an office location from a candidate's eligible work location.
- Seniority is useful context, not a hard filter. Preserve the title and the source's wording; do not infer seniority from years of experience unless the source says so.

## Evidence rules

- Start from the company name, resolve its official website, then locate its official careers page and, when possible, the employer's ATS board.
- Prefer the employer's own site and ATS feed. Use third-party profiles only as leads; do not present them as confirmed hiring evidence.
- Every researched fact needs a source URL and a `checkedOn` date. Each saved job needs its own posting URL, title, location, and checked date.
- Record whether a listing is active, closed, or unclear. Do not turn a careers homepage into a claim that a particular job is open.
- Use explicit values such as `Unknown`, `Not stated`, or `Check posting` when evidence is missing. Never fill gaps with guesses.
- Do not store personal data, credentials, or tracking URLs in evidence links.

## Scaled discovery workflow

Use this workflow for large additions (for example, 1,000 new companies). Keep search discovery separate from evidence verification so a long search does not turn weak leads into catalog facts.

1. **Snapshot the catalog first.** Read every page from `GET /api/comp/catalog?page=1&pageSize=48` and continue through `pageCount`. Build a local exclusion index from each company's official root domain, normalized name, saved names, and legacy keys. If the API is unavailable, use the bundled company JSON files plus the previous batch ledger. Never use an ATS host such as Greenhouse or Lever as the employer's identity when the official company domain is available.
2. **Search in distinct cohorts.** For a 1,000-company goal, work through 20 cohorts of about 50 verified candidates. Rotate among Costa Rica-based employers, Latin America remote employers, nearshore/engineering consultancies, and global product employers with explicit Latin America hiring. Within each cohort, vary the industry or product area (for example fintech, health, commerce, developer tools, security, and SaaS) to avoid repeating the same search results. Treat job-board and company-list results only as leads.
   Use query patterns that combine one geography, one employer segment, and (when useful) one industry or role. Examples: `software company careers Costa Rica fintech`, `remote software engineer Latin America health technology careers`, `nearshore software development company Colombia`, and `site:boards.greenhouse.io "Latin America" software engineer`. Rotate countries and industries, record the query lane in the ledger, and change the wording or segment when new searches mostly return domains already seen.
3. **Deduplicate before deep research.** Resolve each lead to its official website, then compare its root domain and normalized name/aliases to the exclusion index and current cohort. Merge aliases and subsidiaries only when the evidence shows they are the same employer; keep separately operated companies separate. Add each accepted lead to the index immediately so later cohorts do not repeat it.
4. **Verify in two passes.** First confirm the official company site, careers page or ATS board, business model, and stated location policy. Then inspect relevant postings and record each posting's direct URL, exact title, location wording, eligibility, work mode, status, and checked date. If no active relevant posting is found, describe only what the careers source supports and use `possible`, `unverified`, or `not-fit` as appropriate. Do not infer remote eligibility from a remote label alone.
5. **Keep a local ledger.** Use one JSON file per cohort and a small ledger with `batchId`, company name, official domain, status (`lead`, `duplicate`, `verified`, `imported`, or `not-fit`), and the reason for any exclusion. The ledger is for deduplication and retry tracking; only source-backed facts go into company records. Reuse the same cohort IDs when retrying.
6. **Import in bounded chunks.** Save each finished cohort as the documented `{ batchId, companies }` JSON format. Preview it with `node scripts/import-company-batches.mjs <file> --dry-run`, then set `COMPANY_IMPORT_BASE_URL` and run the same command without `--dry-run`. The importer divides large files into requests of at most 100 companies and under 1.8 million bytes, sends them sequentially, retries temporary network/server errors, and stops on validation errors. Re-running the same file is safe because imports upsert by domain/name and merge sources and postings.

For 1,000 new catalog records, expect to review more than 1,000 leads: measure progress by unique, non-duplicate companies that meet the fit policy, not raw search results. Work in 20 cohorts of roughly 50 records and import each cohort as soon as its evidence is complete. This bounds the amount of work to review and makes a failed upload recoverable without repeating web research. The import endpoint stores submitted evidence; it does not crawl websites or fill in missing fields.

## Fit labels

Use `fit.status` to make later review and filtering easier:

- `strong`: direct evidence of a relevant engineering role and a location/work arrangement that can include Costa Rica or Latin America.
- `possible`: relevant engineering employer, but role availability, location eligibility, or stack fit needs review.
- `not-fit`: evidence shows the employer or available roles do not meet the profile. Keep a short reason so later batches can avoid rediscovering it.
- `unverified`: the name is a lead only or available evidence is too weak to decide.

Include short, evidence-based `fit.reasons`, the profile version (`v1` for this brief), and `evaluatedOn`. A fit label is an assessment, not a guarantee that a vacancy is available.

## MongoDB import workflow

Research happens in the future search agent or batch process; the endpoint does not crawl websites or invent missing facts. Submit structured results to the `POST /api/comp/enrich` endpoint. The endpoint validates URLs and fields, upserts by official domain or normalized company name, preserves existing postings and sources, merges repeated job records, and records the batch ID and extraction timestamp. A name-only record is stored as `pending`; once evidence is added it becomes `sourced`.

The endpoint accepts up to 100 companies per request. Example request:

```json
{
  "batchId": "latam-engineering-2026-10-30",
  "companies": [
    {
      "name": "Example Software",
      "website": "https://example.com/",
      "careersUrl": "https://example.com/careers/",
      "model": "direct",
      "tracks": ["Backend", "Java"],
      "locations": ["Remote - Latin America; confirm Costa Rica eligibility"],
      "jobs": [
        {
          "id": "ats-posting-123",
          "title": "Software Engineer",
          "location": "Remote - Latin America",
          "url": "https://jobs.example.com/posting/123",
          "workMode": "Remote",
          "stack": "Java, Spring, React",
          "eligibility": "Latin America; Costa Rica not explicitly listed",
          "listingStatus": "Listed on employer board when checked",
          "checkedOn": "2026-10-30",
          "technologies": ["Java", "React"],
          "roles": ["Backend"],
          "levels": []
        }
      ],
      "sourceEvidence": [
        { "kind": "official-site", "url": "https://example.com/", "checkedOn": "2026-10-30" },
        { "kind": "careers-page", "url": "https://example.com/careers/", "checkedOn": "2026-10-30" },
        { "kind": "job-posting", "url": "https://jobs.example.com/posting/123", "checkedOn": "2026-10-30" }
      ],
      "fit": {
        "status": "possible",
        "reasons": ["Relevant Java engineering role; Costa Rica eligibility is not explicit."],
        "profileVersion": "v1",
        "evaluatedOn": "2026-10-30"
      }
    }
  ]
}
```

The `POST /api/comp/enrich` endpoint currently accepts requests without authentication and accepts up to 100 companies per request. Keep batch JSON in a local file. Imported records are served from MongoDB by the company catalog API when MongoDB is configured; the bundled catalog remains the fallback.

PowerShell upload example:

```powershell
curl.exe -X POST "$env:COMPANY_IMPORT_BASE_URL/api/comp/enrich" `
  -H "Content-Type: application/json" `
  --data-binary "@company-batch.json"
```
