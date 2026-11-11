# Company search profile

This is the working brief for future company discovery and enrichment batches. It reflects the existing directory's emphasis and should be edited as the search changes. Treat unconfirmed preferences as soft criteria; do not claim a personal preference that has not been recorded here.

## Target companies and roles

- Find employers with software engineering teams and current or recurring engineering roles.
- Prioritize full-stack, backend, and frontend product engineering. Keep adjacent engineering roles when the evidence makes them relevant; label the role clearly.
- Useful stack signals include Java/Spring, React/Next.js, TypeScript/JavaScript, Node.js, and Python. Do not reject a good employer solely because its stack is not stated.
- Include direct product employers and engineering consultancies or nearshore firms. Record the business model as `direct`, `outsourcing`, or `unknown`; do not infer it from a company name.

## Geography and work arrangement

- Prioritize roles explicitly open to Costa Rica. Also keep Latin America or worldwide remote roles when the employer's location policy supports them.
- **Hard location gate for the active directory:** a company must have an explicit `Costa Rica`, `LATAM`, or `Latin America` term in its displayed `locations` or in a saved job's `title`, `location`, or `eligibility`. Do not keep a broad region such as `Americas`, `Worldwide`, or `Remote` as a substitute. If the catalog record lacks the explicit term, exclude it from new batches and mark an existing record disliked or archived; preserve it in the catalog for recovery and audit.
- **Use the catalog as the exclusion base before every batch:** fetch every catalog page, build a set of normalized company names/aliases and official root domains, and remove duplicates before research/import. Also run the location gate against the actual fields that render on the company card and its saved jobs. Do not decide from a job search result alone or infer Costa Rica eligibility from global remote wording.
- Remote or hybrid work is useful only when the posting or employer careers source states it. “Remote” without country eligibility remains unverified.
- Keep the source's location wording and distinguish an office location from a candidate's eligible work location.
- A verified first-party office, headquarters, engineering hub, or company team in a named Latin American country may be displayed as LATAM (official company presence: <country>). This is a factual regional label, not a claim that every role accepts candidates from that country. Do not infer regional presence from a customer market, service coverage, a country selector, or a broad Americas/Worldwide claim.
- Seniority is useful context, not a hard filter. Preserve the title and the source's wording; do not infer seniority from years of experience unless the source says so.

## Evidence rules

- Start from the company name, resolve its official website, then locate its official careers page and, when possible, the employer's ATS board.
- Prefer the employer's own site and ATS feed. Use third-party profiles only as leads; do not present them as confirmed hiring evidence.
- When the user will inspect openings directly from each employer's careers page, prioritize finding and confirming more companies. Do not research or copy every individual job; a company record can have `jobs:[]` when its official company/careers evidence and explicit Costa Rica/LATAM location are sufficient.
- Every researched fact needs a source URL and a `checkedOn` date. Each saved job needs its own posting URL, title, location, and checked date.
- Record whether a listing is active, closed, or unclear. Do not turn a careers homepage into a claim that a particular job is open.
- Use explicit values such as `Unknown`, `Not stated`, or `Check posting` when evidence is missing. Never fill gaps with guesses.
- Do not store personal data, credentials, or tracking URLs in evidence links.

## USA hiring cohort — 2026 LATAM engineering

- Add a company to the curated `USA` directory view only when an official company page, filing, or primary company source verifies a U.S. headquarters or office **and** dated 2026 evidence shows software or adjacent engineering hiring for people based in Latin America. A U.S. customer market, U.S. contract recipient address, or generic “Americas” remote policy alone does not pass.
- Prefer first-party company careers pages and employer ATS records (Greenhouse, Lever, Ashby, Gem, and similar systems). Save the actual posting URL, title, LATAM location/eligibility, checked date, and the listing status. A role published in 2026 proves public hiring intent; it does not prove that a hire completed. Only say a hire was made when a company source says so.
- Search public procurement registries such as USAspending, company press/news releases, public news archives, and company engineering or hiring blogs as separate discovery lanes. A contract award can surface a software vendor, but cannot establish that the vendor hired LATAM engineers. A news article or blog is supporting evidence only when it names the company and explicitly connects it to LATAM software hiring or a LATAM engineering team. Verify company identity and location against first-party sources before importing.
- The reusable collector `scripts/fetch-usa-public-source-leads.mjs` saves USAspending new-award records (using `date_type: new_awards_only`) and GDELT news/blog article links. USAspending transaction-action searches can return older awards with 2026 modifications, so use the new-awards date type when the question is who won work in 2026. The GDELT DOC endpoint covers a rolling 90-day window; use archived releases, RSS, or employer ATS history for earlier 2026 evidence. Its output is a lead pool, never an import batch. Use `--contracts-only` when the news feed is rate-limited or unavailable.
- Use the tag `usa-latam-2026` for reviewed cohort entries. The `USA` tab shows this tag-defined, evidence-reviewed cohort, rather than every U.S. company already in the broader catalog. Preserve other tags, including `new`, when importing. Update existing employers by canonical domain/name instead of inserting a second company record.
- Keep direct employers and staffing/outsourcing firms distinct in `model`. For agency postings that describe an unnamed U.S. client, record the agency as the employer and do not invent the client's identity. When the client is named, assess whether it is independently verifiable before adding it as a company.

## Automated active-job search and validation

Use `scripts/search-validate-jobs.mjs` when the goal is current postings rather than new employer leads. It loads the live Comp catalog and shared preferences, discovers Greenhouse, Lever, Ashby, and SmartRecruiters boards already linked from saved jobs, then reads each board feed in bounded parallel requests. It accepts only live ATS entries with a relevant engineering title and current ATS title/location or work-eligibility text that explicitly names Costa Rica, LATAM, or Latin America. It excludes generic applications and talent-pool records, deduplicates postings, and caps results per employer.

Preview and validate a 50-job batch without importing:

```powershell
node scripts/search-validate-jobs.mjs --target 50 --max-per-company 4 --concurrency 8
```

The script writes the grouped enrichment payload and a report under `company-batches/`. Add `--import` to submit the batch after it has validated the exact target count. That updates existing employer records, adds the `new` tag, and preserves their saved fields. The latest posting batch appears in **New** and **Latest batch** even when an employer is already liked; disliked or archived records stay filtered out. If fewer than the requested number pass every check, the script saves the partial files and skips import. It searches ATS boards discoverable from job URLs already in the Comp catalog; careers pages without a supported linked ATS are reported as unsupported leads for a later source expansion.

## Scaled discovery workflow

Use this workflow for every large addition. **Discovery and dedupe are bulk script work; source verification is reserved for unique survivors.** The active directory accepts batches of at most 100 records.

1. **Use one catalog snapshot per batch.** `scripts/dedupe-company-candidates.mjs` reads the Mongo catalog once, then adds bundled records to one local name/alias/domain index. Mongo projections keep only fields used by matching and the likes/dislikes baseline. Never make a database compare call per lead. Save the snapshot with `--snapshot-out`; reuse it for name-only screening and the final name/domain compare with `--snapshot-in` so retries and multi-stage resolution do not re-read Mongo. With Mongo available, completed imports are already in that snapshot, so skip rescanning every discovery JSON file. Treat snapshots as cohort-specific and fetch a fresh one after importing a batch. Keep Mongo as the source of exclusions and do not print connection strings or credentials.
2. **Collect raw leads in bulk.** Harvest roughly 500–1,000 names per 100-company target across separate query lanes. Use the installed fetchers, public job APIs, official ATS feeds, and broad company/careers queries. Store `name`, `queryLane`, source URL, and official website/domain when the source exposes it. A job-board/company-directory result is a lead only; do not enrich or import it yet.
3. **Deduplicate the whole lead pool in one process.** Pass all source files positionally to the deduper so it reads Mongo once and compares every row in memory:

   ```powershell
   node scripts/dedupe-company-candidates.mjs .\company-batches\lane-a.json .\company-batches\lane-b.json .\company-batches\lane-c.json --names-only --snapshot-out .\company-batches\cohort-mongo-snapshot.json --out .\company-batches\cohort-name-unique.json --ledger .\company-batches\cohort-name-ledger.json --cohort <cohort-id> --limit 1000
   node scripts/resolve-company-domains.mjs .\company-batches\cohort-name-unique.json --search-budget 30 --region "Latin America" --out .\company-batches\cohort-domain-candidates.json
   node scripts/verify-company-leads.mjs .\company-batches\cohort-domain-candidates.json --limit 200 --out .\company-batches\cohort-official-verified.json
   node scripts/dedupe-company-candidates.mjs .\company-batches\cohort-official-verified.json --snapshot-in .\company-batches\cohort-mongo-snapshot.json --out .\company-batches\cohort-unique.json --ledger .\company-batches\cohort-ledger.json --cohort <cohort-id> --limit 1000
   ```

   This compares normalized names, known aliases, and official root domains against the catalog, previous imports, and earlier leads in the same run. For name-only sources, use `--names-only` as the early screen. A resolver output is only a proposed website; the verifier must confirm company identity and first-party fit/location before a proposed domain is used in the final dedupe. Then run the full dedupe against the same cached Mongo snapshot before shaping/import.

   **Domain-resolution strategy:** preserve official domains when a fetcher sees them; resolve only name-unique leads missing a site; reuse the default local domain cache; bulk-check Wikidata before individual search; then cap live search with `--search-budget N` for the fast/review path. A bounded run defaults to Bing-only based on p019/p024/p025 results; use `--search-engine both` to add the slower DDG fallback. The collector counts this budget across the whole run, not once per slice. The resolver prioritizes explicit Costa Rica evidence, then LATAM evidence, and uses Mongo-derived like/dislike contrasts as a small soft tie-breaker when candidate metadata matches a model, track, or role-family feature. That preference adjustment is capped at ±6 ranking points and cannot override geography or evidence gates. Over-budget leads remain in the resolver output marked for manual review. Leave the budget unset for unlimited two-engine search; with a budget, pass `--domain-search-engine both` if full fallback coverage matters more than speed. Use `--no-domain-cache` for a clean timing benchmark. Cache results are candidate URLs only and must pass current first-party verification. Positive cache entries expire after 180 days; full-search no-match entries expire after 14 days.
4. **Adapt using measured lane yield.** Read the dedupe ledger before gathering more leads. After 20 leads in a lane, pause it if fewer than 15% survive. Prefer lanes with current official ATS/careers pages and explicit Costa Rica/LATAM eligibility. Retire a query lane when it returns mostly catalog matches; search a new employer segment or source instead.
5. **Verify only name-unique survivors, in bounded slices.** `scripts/verify-company-leads.mjs` uses 24 concurrent official-site workers by default. It checks each homepage for company identity, software fit, and Costa Rica/LATAM presence first; if the homepage proves both fit and local or regional eligibility, it skips follow-up requests. Otherwise it fetches at most two targeted company/careers pages (`--max-pages 2`; use 3 only for unresolved evidence). Start with at most 200 survivors using `--limit 200`; if that slice yields fewer than 100 acceptable leads, continue with `--offset 200 --limit 200` and a different `--out` file. Keep `websiteCandidate` separate until verified. If the user will review job postings on the employer's site, do not inspect them one by one; leave `jobs` empty. Save a specific job only when it is needed to prove location eligibility or adds unusually useful role evidence. A remote label or broad “Americas” term is not location proof.
6. **Shape the reviewed survivors with `scripts/shape-company-batch.mjs`.** Give it the deduped candidate file and a review manifest containing rejected names, selected manual exceptions, and any reviewed source/location overrides. It carries source lanes forward, keeps only first-party evidence, and checks name/domain uniqueness before preparing records.
7. **Prepare and import one complete batch.** Use `scripts/prepare-company-batch.mjs` to enforce dated evidence, location, fit, within-batch uniqueness, the 100-record limit, and `tags:["new"]`. Run the importer dry run, then the actual import. Upserts make retrying a failed import safe.

For a goal of 1,000 records, search more than 1,000 leads and work in 10 completed batches of 100. Search and full-catalog dedupe should happen in minutes; time-consuming evidence review should never be spent on leads that the local index already rejects. Measure progress by unique, non-duplicate companies that meet the fit policy, not raw search results. The importer stores supplied evidence and does not crawl websites or invent missing fields.

## Fast repeatable 100-company batches

The batch deduper reports its Mongo snapshot size and duplicate rate per `queryLane`. Use that report to choose the next 500–1,000 leads; do not carry low-yield searches forward by habit. Company verification comes after dedupe, and every accepted record still needs first-party dated evidence.

For a reusable bulk collection and verification run, use `scripts/collect-and-dedupe-company-leads.mjs`. It starts selected installed source fetchers concurrently (three at once by default, while respecting each source's own rate limits), reads all resulting files asynchronously, and makes one bulk name/hash pass against a single Mongo snapshot. Then it resolves missing official domains and verifies unique-site slices of at most 200 in parallel, reuses that snapshot for name/domain dedupe, and stops once it has 100 verified, domain-unique leads. The default sources are Alpunto, CINDE, CAMSCAT, Himalayas Costa Rica roles, the Costa Rica nearshore directory, and software providers. `--source` selects a custom source mix; repeat it or pass a comma-separated list. Use `--input` to add already harvested directory or Manifest files. `--domain-search-budget 30` caps live per-company domain searches across the entire run; bounded mode defaults to Bing-only and is the fast path when unresolved names can be reviewed manually. Use `--domain-search-engine both` to add DDG fallback. `--wikidata-only` skips all individual search-engine fallback. These options leave candidates with no site unresolved, so they can reduce the number of companies that pass strict verification. The local domain cache is on by default; `--no-domain-cache` is for clean benchmarks. The script writes raw leads, the reusable snapshot, each verification slice, the strict unique pool, per-engine resolver timings, and a timing report. Once the target is reached it shapes and prepares 100 records; pass `--import` to dry-run and import them to the local app at `http://localhost:3000`.

The deduper's name and domain indexes are in-memory `Map`s: normalized names, aliases, and official root domains become keys; each lead gets checked once and each accepted lead is inserted immediately so within-pool repeats are rejected too. This is O(number of leads) expected work. Worker threads would add overhead and cannot share a JavaScript `Map`; keep concurrency on network fetches, where waiting on different sources and official sites is the real benefit. The supported repeatable flow is: collect asynchronously -> name-dedupe once -> resolve sites for survivors -> verify with 24 concurrent official-site workers -> compare domains against the saved snapshot -> shape and import.

Snapshot flags now parse from kebab-case CLI names (`--snapshot-out` / `--snapshot-in`) to the internal `snapshotOut` / `snapshotIn` options. The earlier parser did not perform that conversion, so those flags could silently be ignored and a later pass could read Mongo again. Reuse the saved snapshot for the final full name/domain compare; get a fresh snapshot only after an import.

Use the snapshot's `likeBaseline`, `dislikeBaseline`, and `preferenceContrast` to tune the next source mix. Current regional evidence covers 67 liked and 101 disliked companies. Outsourcing appears on 47/67 likes (70%) and 54/101 dislikes (53%); the `Nearshore` track appears on 9/67 likes (13%) and 3/101 dislikes (3%). This supports a modest nearshore/outsourcing source bias. Generic `Engineering` appears on 36/67 likes and 64/101 dislikes, so it is too broad to predict preference. `preferenceContrast` reports counts, per-group rates, and rate differences for model, track, and role-family signals each time a Mongo-backed compare runs. These are soft signals: do not reject companies based on them or weaken the Costa Rica/LATAM evidence gate. Like/dislike records currently store the decision but not its reason, so reason labels such as wrong location, no relevant roles, or wrong business type would make future tuning more precise.

Measured speed: normalized name/domain comparison takes seconds for hundreds of leads; network retrieval is the bottleneck. On p019, profile extraction took 7.94 seconds for 313 profiles and found 202 site candidates. The 73.13-second resolver stage handled 113 unresolved names: one bulk Wikidata lookup suggested 6 domains; DDG/Bing produced 7 candidates; 100 remained unresolved. The resolver now caches successful suggestions for 180 days and full-search misses for 14 days, accepts like/dislike contrast metadata for soft ordering, and reports cache, bulk lookup, live-search, and output timings. Keep job-by-job review out of discovery and verify only new names with a resolved official site.

### Observed results — cohort `likes-based-2026-11-07-p017` (name stage only)

- One bulk pass read a 1,620-company Mongo catalog once and compared 209 leads from five source files against 1,769 indexed names/aliases and 1,582 root domains. It removed 77 name duplicates and produced 132 name-unique leads. This is a discovery shortlist only; it is not a verified or importable batch.
- Name novelty by lane: Manifest page 6 was 24/30, page 7 was 27/30, page 8 was 25/30, page 9 was 25/30, and Nearshore Hub was 31/89. The Manifest pages have strong name novelty but still need official-site checks. Nearshore Hub previously passed the strict company fit/location check at only 2/31, so its verification lane remains paused despite the number of new names.
- No further company discovery was run after the user redirected this work to pipeline speed and feedback tuning. Do not import these name-only leads.

### Observed results — cohort `likes-based-2026-11-07-p019` (timed source and verification run)

- Seven concurrent-capable source fetchers returned 593 leads in 4.59 seconds of wall time. One Mongo snapshot and one in-memory dedupe pass took 2.23 seconds end to end (including the 1.96-second catalog read), removed 264 duplicates, and left 329 name-unique leads. The actual 593-row name comparison took 4 ms.
- Profile-first site extraction checked 313 directory/employer profiles in 7.94 seconds and found 202 website candidates. The resolver then spent 73.13 seconds on 113 unresolved names: six candidates came from the bulk Wikidata lookup, seven from DDG/Bing, and 100 had no candidate. Total resolution time was 81.07 seconds; individual search remains the main speed bottleneck.
- Official-site verification checked 329 candidates in 36.88 seconds across 398 page requests. Fifteen passed the strict fit/location pattern; final name/domain comparison removed eight that matched existing catalog records, leaving seven new unique companies. The 100-company target was not reached, so this cohort was not imported.
- Source adaptation: Enterprise League Uruguay yielded 4/15 strict passes; Aworkado LATAM yielded 2/9; CAMTIC yielded 2/59; Alpunto software/SaaS and developer lanes yielded 2/32 and 5/67; CamSCAT yielded 0/13. Continue only the better-performing lanes in small fresh slices; pause lanes below 15% after 20 checks. The other sources were novelty leads but did not produce a meaningful strict batch in this run.
- Next optimization: preserve direct employer domains and profile URLs at collection time, resolve profile pages before search fallback, and avoid per-name web searches for low-yield or unresolvable lanes. Improve source fit/location yield before increasing verification concurrency. See [COMP_ALGORITHM_README.md](./COMP_ALGORITHM_README.md) for the stage-by-stage benchmark and long-term scale roadmap.

### Observed results — cohorts `likes-based-2026-11-07-p020` through `p022` (recheck of saved pools)

- `p020` deduped 850 saved strict-verification rows against one current Mongo snapshot to 44 name-unique leads, then rechecked the official sites in 7.6 seconds. Thirty-one passed the final domain check in a 10.2-second run; none were imported because the batch target was 100.
- `p021` pooled 1,373 cached domain-bearing rows. One snapshot/name pass took 2.25 seconds, removed 907 duplicates, and left 466 candidates. Rechecking all 466 took 52.7 seconds across 836 official-page requests and left 26 current strict unique companies. This is lower than the initial p020 pass because five earlier strict results did not survive fresh verification.
- `p022` rechecked 174 saved p002/p003/p021 rows in 5.8 seconds. It removed 139 duplicate names, verified 35 sites in 3.2 seconds, and produced the same 26 companies as p021—zero incremental additions. Prior high-yield remote and ATS cohorts are exhausted against the current catalog.
- Do not count p020/p021/p022 as additive batches: they overlap. There are 26 current strict, not-yet-imported survivors in the saved pool, and no 100-company batch has been imported from these runs. Further discovery needs genuinely new employer/ATS sources with official sites and explicit Costa Rica/LATAM evidence; don't repeat the p002 or p003 files.

### Observed results — cohort `likes-based-2026-11-07-p023` (direct ATS sample)

- A direct first-party ATS/employer-careers sample collected 17 Costa Rica/LATAM engineering company leads. One bulk Mongo/name compare left 27 unique records after combining them with the 26-company strict pool; 16 of the 17 ATS employer names were already in the catalog. Verification took 5.3 seconds for 27 official sites. The only new name did not pass the strict evidence gate, so the strict pool remained the same 26 and the run imported nothing.
- Direct ATS discovery is the preferred source shape because the posting gives an employer, first-party role, and country eligibility together. This sample is now exhausted; seek new ATS boards/employers rather than repeating these queries. A high raw-job count is not a high new-company yield.
- The p019–p023 runs have not produced the requested 100-company batch. The 26 strict records are a research pool only. Do not tag or import them as a partial batch.

### Observed result — cohort `p024-domain-resolution-10-2026-11-07` (10-search timing replay)

- Replayed p019's 113 post-profile unresolved leads with cache disabled, concurrency 8, and a live per-company search budget of 10. One bulk Wikidata lookup took 0.770 seconds and suggested 6 sites. Ten DDG/Bing company searches took 16.839 seconds wall time across 20 engine requests and produced 2 additional site candidates; the aggregate overlapping worker time was 84.187 seconds. The resolver took 17.624 seconds total and deferred 97 names from individual search.
- Compared with p019's 73.132-second resolver stage, this was 55.508 seconds (75.9%) faster, with lower individual-search coverage. It is a timing/coverage tradeoff, not a quality-equivalent run. The 8 suggested sites were not first-party verified, and nothing was imported. Full report: `company-batches/p024-domain-resolution-10-2026-11-07/timing-report.json`.
- The p024 output records the top-priority search sample and timings for each resolver stage. Use this same 113-lead input for concurrency comparisons; keep `--no-domain-cache` on each run to avoid cache-hit timings.

### Observed result — cohort `p025-domain-resolution-10-bing-2026-11-07` (Bing-only replay)

- Replayed the same 113 post-profile p019 leads with the same ten-search budget and no cache, selecting Bing only. One bulk Wikidata lookup took 1.082 seconds; ten Bing requests took 638 ms wall time and 3.683 seconds summed per-name time. The resolver finished in 1.736 seconds total with 6 Wikidata and 2 Bing site candidates; 97 individual searches remained deferred.
- Compared with p024's two-engine mode, total resolver time fell from 17.624 to 1.736 seconds (90.1%); live-search wall time fell from 16.839 to 0.638 seconds (96.2%). Both runs returned the same 8 raw site candidates for this sample. These are unverified URLs and the bounded search skipped 97 per-name lookups, so this proves a latency improvement on the ten selected searches, not a quality-equivalent full-corpus result.
- p025 recorded 162–477 ms per Bing request with no errors. Keep Bing-only as the bounded default and leave `both` available for a full-coverage search or when a source-specific benchmark shows DDG adds useful candidates. Timing report: `company-batches/p025-domain-resolution-10-bing-2026-11-07/timing-report.json`.

### Observed results — cohort `likes-based-2026-11-07-p006`

- One dedupe run compared 308 leads from 8 input files against one Mongo snapshot (1,320 Mongo documents; 1,520 normalized names/aliases and 1,465 root domains across the indexed catalog and prior batches). It produced 183 unique candidates in about 2.7 seconds; 30 rows matched an indexed name/domain and 95 lacked enough identity to enter the index. Do not spend source-review time on those rejected rows.
- The fast official-page screen found both engineering-fit and location evidence on 112 of the 183 unique candidates. The reviewed batch selected 96 from that set and 4 additional candidates after manually confirming their official software and Costa Rica pages. The batch preparer wrote 100 records, each with `tags:["new"]`, and the importer created all 100 without updating an existing company.
- All 100 imported records appear in the directory's **New** view. The New count is cumulative: it shows 300 because earlier imported records also retain the `new` tag. **Latest batch** isolates the newest imported batch, so it shows these 100 separately.
- Best novelty lanes were CAMTIC (68/68), Guía TIC (29/29), ContactOut (31/31), and the Costa Rica company directory after official-site resolution (28/33). Small local software and nearshore waves produced 7/11, 5/9, and 8/10; keep sampling these but re-evaluate fit rate after each batch.
- Retire the CINDE roster for immediate rediscovery (95 leads, 0 incremental candidates), the 270-company Himalayas Costa Rica feed (0 incremental candidates in its prior full comparison), and the broad official careers wave (0/15 incremental candidates). Prefer source diversity and fresh employer segments over repeating those lists.
- The compare pass was not the hour-long part: name/domain comparison took seconds. For the next cohort, harvest up to 1,000 raw leads in bulk, resolve missing official domains only after the name-only pass, and run one full Mongo-backed dedupe. Verify at most 200 unique, identity-complete survivors per slice; continue another slice only if needed to reach 100. Track both dedupe yield and the eventual fit/location pass rate by `queryLane`; after a lane has 20 leads, pause it if fewer than 15% survive either gate. Stop enrichment once there are 100 approved records, then prepare, dry-run, and import one batch.

### Observed results — cohort `likes-based-2026-11-07-p007`

- The final pool of 112 leads was compared against one Mongo-backed/local index in about 3 seconds. Six duplicates were removed; 106 unique survivors remained. The index covered 1,543 normalized names/aliases and 1,488 official root domains.
- The official-page verifier checked all 106 survivors concurrently in about 12 seconds. One hundred initially passed both software/technology fit and an explicit Costa Rica/LATAM page signal; 96 also passed the stricter local-presence or hiring-eligibility pattern. The review manifest removed four clear false positives and documented eight reviewed exceptions with supporting source links. The batch preparer then validated exactly 100 unique names and domains.
- The first import created all 100 records. A second import corrected location labels in place, updating those same records without creating duplicates. All 100 have `tags:["new"]`; the API reports 400 cumulative records in **New** and 100 in **Latest batch**.
- This run's CAMTIC member lane yielded 16/16 names not already in the catalog; 12 passed the automated fit/location gate. Keep CAMTIC for fresh Costa Rican software/ICT members, but use a member profile only to support local presence—confirm software fit on the company's own page. Addax, S-COM, and Modul Apps are useful examples of the source pair.
- Pause the fresh official LATAM remote-careers query (0/10 unique) and the Costa Rican supplier-profile resolver (3/118 official websites resolved, 2.5%). Seven added Sortlist country pages produced no new entries; do not spend time repeating that expansion.
- Source comparison was not the bottleneck: 112 comparisons took about 3 seconds and verification took about 12 seconds. The remaining cost is source quality and fit review. Keep collecting 500–1,000 raw leads, compare once, then verify only unique survivors. The lane report in `scripts/verify-company-leads.mjs` now records fit/location pass rates and recommends pausing a lane below 15% after 20 leads.
- The batch shaper now derives a Costa Rica location label only when the official location snippets actually name Costa Rica; a generic local-presence flag no longer turns an office in another country into a Costa Rica claim. Regional eligibility or explicit LATAM evidence is labeled as LATAM, with per-role eligibility left for review.

### Observed results — cohort `likes-based-2026-11-07-p008` (earlier broad-fit pass)

- The existing primary pool contains 439 unique candidates, checked in three verifier slices with the earlier broad-fit matcher. It reported 37 local-presence/work-eligibility passes; do not treat that older count as final after the p009 matcher tightening. Candidate pages that mention a country as a customer market, map selector, or product availability do not pass the location gate.
- A new Find Remote feed grouped 574 software-engineering listings into 176 employers. One name-only compare removed 51 catalog duplicates in seconds and left 125 names. The domain resolver found 14 unambiguous Wikidata website suggestions; verifying the pool produced three automated fit/location passes, all rejected on review because the snippets described a country selector, sales coverage, or a talent market rather than company presence or hiring eligibility. Pause this feed until it provides direct company/ATS URLs.
- The 35 name-unique Startup506 leads produced four search-based domain candidates, two loose fit/location signals, and no verified local-presence or hiring-eligibility matches. Pause this lead lane for this batch.
- The 16 direct LATAM career/ATS leads in the manual follow-up were all duplicates. Link Design was the one additional Costa Rican software company to survive the local-company comparison and pass first-party fit/location verification; retain it as a reviewed candidate for a complete batch.
- The scripts now cache one Mongo snapshot across the name-only and full-domain stages. The company shaper carries jobs only when the review manifest explicitly supplies them, so third-party listing data cannot silently become saved job evidence. Use one 500–1,000 lead pool, check the source-lane ledger, pause lanes below 15% yield, and spend verification time only on unique leads with an official domain or an approved domain candidate.

- Rechecking the high-yield slice with the p009 verifier produced 29 company-level records after name/domain dedupe and shaping; this is a research pool for the next 100, not an imported batch. The 105-company slice took 17.7 seconds across 150 official-page requests and yielded 25 strict signals before the wider cohort dedupe. Continue from this pool only after a fresh Mongo snapshot is taken for the actual import batch.

### Observed results — cohort `likes-based-2026-11-07-p009` (search flow benchmark)

- Compared 440 candidate records from two files in one Mongo-backed in-memory pass. The refreshed projection indexed 1,977 names/aliases and 1,922 root domains; no database comparison call was made per candidate, and completed imports were not re-read from the discovery-file directory.
- CAMTIC's five-page name harvest produced 131 leads. One bulk name-only pass removed 71 existing companies and left 60 new names. Profile enrichment returned 14 candidate websites; the batched resolver found eight website suggestions across the same 60 names.
- The first 20-worker profile-enrichment attempt triggered 508/timeouts on 46 CAMTIC profile pages. Retrying only those failures at concurrency 3 resolved all 46 official website links. The tightened verifier then checked all 60 names in 13.2 seconds across 94 official-page requests and retained 2/60 strict employers (Coral and TecApro); this remains below the 15% lane threshold, so pause CAMTIC for now. Earlier broad-fit false positives from law and education pages motivated the more specific software matcher and education-provider rejection.
- Combining the high-yield company slice, the rechecked earlier survivors, and the two CAMTIC survivors in one full compare removed 34 duplicates from 206 records. The shaper produced 30 company-only candidates with dated official evidence and empty job arrays. This is the current p009 research pool, not an imported 100-company batch.
- Current next-batch source priority: use fresh official software/careers or employer association lists that resemble the liked nearshore/outsourcing cohort; exclude the catalog with one bulk script pass first. Do not repeat CAMTIC, broad Guía TIC, or generic regional agency directories whose verified fit/location yield fell below 15%.

Example reviewed-batch shaping step:

```powershell
node scripts/shape-company-batch.mjs .\company-batches\cohort-unique.json .\company-batches\cohort-review-manifest.json --out .\company-batches\cohort-approved.json
node scripts/prepare-company-batch.mjs .\company-batches\cohort-approved.json --batch-id cohort --out .\company-batches\cohort.json --ledger .\company-batches\cohort-import-ledger.json --limit 100
```

### Observed results — cohort `likes-based-2026-11-06-p003`

- One run combined 168 leads from three files, read the 1,220-company Mongo catalog once, removed 67 duplicates locally, and found 101 unique candidates in about 3 seconds. The added 100-company file was prepared from 100 of those unique records; all have `tags:["new"]`.
- The 41-record verified supplement produced no additional unique companies after comparison with the existing pool. Do not spend deep-research time on a company until its name and official root domain survive the combined pass.
- Highest-yield lanes were `LATAM remote engineering careers` (53/53) and `Costa Rica employer and careers sources` (20/21). Continue these with fresh industries and official employer sources.
- Useful secondary lanes were `Himalayas CR engineering leads; official ATS verification` (5/11), `Official LATAM ATS engineering roles` (2/7), and `Official Greenhouse Latin America engineering roles` (1/5). Keep them bounded and dedupe before opening individual postings.
- `Official Costa Rica ATS engineering roles` returned 1/13 unique; switch ATS source or employer segment instead of repeating that query lane. Some small CR software firms have no public vacancy page, so keep their company-level fit `possible` and leave `jobs` empty unless an active role is actually supported.

### Observed results — cohort `likes-based-2026-11-07-p016` (100-company fast batch)

- Combined the 84-record p011 approved pool with newly verified Manifest survivors. The verifier checked 36 official sites in 7.0 seconds across 66 requests; 16 showed both software fit and a Costa Rica/LATAM signal, and 13 passed the stricter local-presence or work-eligibility pattern. Shaping also retained four p013 survivors, producing 16 additional approved companies overall.
- The final name/domain pass compared 100 prepared candidates against one cached Mongo snapshot in one local pass and found zero duplicates. The importer created all 100; it updated none. Every record has `tags:["new"]` and `jobs:[]` so the user can inspect openings on company careers pages.
- The app’s **New** tab is tag-based and cumulative; it now shows 500 records. **Latest batch** isolates the current import and returns exactly 100. Both counts were confirmed through the live catalog API.
- This Manifest expansion yielded 8/17 approved companies from page 4, 2/6 from page 5 ranks 151–165, and 2/13 from page 5 ranks 166–180. Page 4 is the strongest fresh slice; the 166–180 slice is at the 15% pause threshold, so don’t expand it further without a new source list. The p016 verifier pass itself completed in seconds, so source freshness and evidence yield remain the main limits.
- Next batch: take a fresh Mongo snapshot after this import, collect 500–1,000 names in one pool, and perform one local name/domain compare before resolving sites. Expand fresh CAMTIC/Guía TIC and nearshore-company lists only where they provide names absent from this batch. Prefer current official company directories and page 4-like sources; use remaining Manifest pages only after a name-only novelty check. Keep verification bounded to 200 unique sites per slice, jobs empty, and the same strict Costa Rica/LATAM rule. Use the refreshed like/dislike baseline as a modest source-mix signal, then write the next measured yields here.

### Observed results — USA cohort `usa-latam-2026-p002-2026-11-08`

- Combined 22 leads from official ATS postings, the 2026 SEC EDGAR Form D registry, a 2026 SAM.gov/USAspending award lead, and TRM Labs' company newsroom. One saved Mongo snapshot pass removed 16 identity/domain duplicates and found 6 new catalog candidates.
- Imported 10 reviewed USA-cohort updates: created 4 companies (Caliza, Tech Holding, Utility Profit, Omnissa) and updated 6 existing records (Backblaze, CodePath, Wagmo, Sezzle, TRM Labs, Glacier). Upserts preserved the one-record-per-company model. The live USA tab increased from 10 to 20 and was confirmed through the catalog API.
- The SEC Form D was used to verify Caliza's Miami principal place of business. The federal award surfaced TRM Labs as a software-services vendor, but contract and newsroom sources do not prove LATAM hiring. Current employer postings establish hiring intent; Glacier's posting also describes an existing three-person LATAM Fleet software team. Do not claim completed hires unless a company source confirms them.
- 66degrees and Goodway Group were not imported because their company ATS boards did not show a current LATAM software opening at review time. Siena AI stayed out because the official U.S. office evidence did not meet the cohort's location standard with enough confidence. The public-news collector's GDELT endpoint returned HTTP 429 in the earlier collection; keep that error visible and retry at a bounded rate rather than treating the incomplete news lane as coverage.
- Batch, review, dedupe, and reconciliation files are under `company-batches/usa-latam-2026-p002-*`.

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
