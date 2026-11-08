# Comp Algorithm

## Product ownership and goal

**Owner and creator: Allan**, as specified by the product owner. The company and job discovery method, matching strategy, deduplication logic, feedback signals, and implementation are treated as private product IP intended for future commercialization.

The long-term product goal is to search a corpus of hundreds of millions of employment records and handle very large volumes of search requests quickly, while finding employers and jobs that fit a person's location, engineering interests, and likes/dislikes. This run establishes an initial architecture and benchmark only. It does not demonstrate performance at that scale.

## Current algorithm

1. **Collect leads concurrently.** Run independent public source fetchers at bounded concurrency. Preserve the source lane and URL for every lead so yield and evidence can be measured later.
2. **Take one catalog snapshot.** Read Mongo once for the whole cohort; do not make a database request for every candidate.
3. **Bulk-deduplicate before enrichment.** Normalize company names and aliases, reduce official websites to root domains, then check each lead against in-memory `Map` indexes. Add each survivor to the same indexes immediately to catch repeats inside the incoming pool.
4. **Resolve only unique survivors.** Preserve official domains at collection time, then extract official site links from source/company profile pages. Bulk-check remaining names against Wikidata and a reusable local resolution cache. Use per-company search only for a bounded, high-priority remainder; leave over-budget names unresolved for manual review.
5. **Verify first-party evidence concurrently.** Check company identity, software/engineering fit, and explicit Costa Rica or Latin America presence or work eligibility. Only fetch additional first-party pages when the homepage does not prove the required facts.
6. **Compare verified domains against the same snapshot.** Do one final bulk comparison, then shape and prepare a batch of no more than 100 companies. Records intended for review receive the `new` tag. Import only when a complete batch passes the evidence and uniqueness rules.
7. **Learn from feedback and lane yield.** Compare source lanes by name novelty and strict evidence pass rate. Use likes/dislikes as soft ranking signals; do not let them override location or evidence requirements.

Expected name/domain lookup work is **O(n)** for a pool of `n` leads, assuming normal hash-map behavior. The current implementation keeps the exact-match indexes in one process. Network I/O is where concurrency helps; worker threads do not share a JavaScript `Map` and would add coordination and copying overhead for this workload.

## Timed benchmark — November 7, 2026

Run: cohort `likes-based-2026-11-07-p019`, using seven source fetchers, profile-first domain extraction, one Mongo snapshot, and a strict target of 100 verified, domain-unique companies.

| Stage | Measured time | Result |
|---|---:|---|
| Source fetch wall time | 4.59 s | 7 fetchers completed; 593 raw leads |
| Sum of fetcher process times | 16.73 s | Fetchers overlapped; this is summed worker time, not wall time |
| Read, merge, and write lead pool | 45 ms | One combined pool |
| Mongo snapshot load | 1.96 s | One catalog read for the cohort |
| Name dedupe process | 2.23 s | 593 leads → 329 name-unique; 264 removed as duplicates |
| In-memory candidate compare | 4 ms | All 593 rows checked against the built index |
| Directory-profile site extraction | 7.94 s | 313 unique profiles checked; 202 yielded a website candidate |
| Domain resolver stage | 73.13 s | 113 unresolved leads; 6 Wikidata suggestions and 7 DDG/Bing candidates; 100 had no candidate |
| Total site-resolution time | 81.07 s | Profile extraction plus search fallback |
| Official-site verification | 36.88 s | 329 candidates; 398 official-page requests; 15 strict passes before final dedupe |
| Final name/domain dedupe | 435 ms | 15 strict passes → 7 new unique companies |
| Total before report writing | 125.31 s | No 100-company batch was ready, so nothing was imported |

The run stopped short of 100 because only seven companies passed both first-party evidence checks and the final duplicate check. A failed target is not converted into a partial import. A preceding name-only Manifest run (`p018`) took 26.86 seconds for 120 leads and produced one strict pass; leads without usable official-site links do not form an efficient verification source.

### Follow-up benchmark — saved research pools

| Run | Input and dedupe | Verification | Final strict unique | Elapsed | Imported |
|---|---|---|---:|---:|---|
| `p020` | 850 previously verified rows → 44 name-unique after the current Mongo snapshot | 44 sites; 7.6 s internally | 31 | 10.20 s | No |
| `p021` | 1,373 cached rows → 466 name-unique; one snapshot and compare took 2.25 s | 466 sites in three slices; 52.67 s internally across 836 official-page requests | 26 after current re-verification | 57.05 s | No |
| `p022` | 174 cached rows → 35 name-unique; 139 removed by current-catalog/in-pool dedupe | 35 sites; 3.2 s internally | 26, all already present in `p021` | 5.76 s | No |
| `p023` | 43 rows: the same 26 survivors plus 17 direct ATS/employer leads → 27 name-unique | 27 sites; 5.3 s internally | 26, all already present in `p022` | 8.91 s | No |

These runs show why historical research must be compared to the live catalog before it is counted as new. `p020` had 31 strict survivors on its first check; rechecking those sites in `p021` retained 26. `p022` found zero additional companies from the older high-yield `p002` and `p003` files. Across the three runs, the usable current pool remains 26 companies, not 100. None was imported because the complete 100-record target was not met.

The p023 direct ATS sample covered current Costa Rica/LATAM engineering postings on Ashby, Lever, and Greenhouse, plus official employer career pages. Sixteen of the 17 employer names already matched the catalog; the one name-unique survivor did not pass strict first-party fit/location verification. The direct ATS sample therefore added zero companies to the 26-company strict pool.

### Bounded domain-resolution replay — November 7, 2026

Run: cohort `p024-domain-resolution-10-2026-11-07`, replaying the same 113 post-profile unresolved leads from p019. Cache was disabled, resolver concurrency was 8, and `--search-budget 10` limited DDG/Bing fallback to ten candidates. One batched Wikidata lookup still checked the entire pool.

| Stage | Measured time | Result |
|---|---:|---|
| Read input | 2 ms | 113 saved unresolved leads |
| Cache lookup/match | 1 ms | Cache disabled; no cached results used |
| Bulk Wikidata | 770 ms | 6 candidate sites |
| DDG/Bing live searches | 16.839 s wall | 10 companies searched; 20 engine requests; 2 candidate sites |
| Summed live-search worker time | 84.187 s | Overlapping per-company time; not additional wall time |
| Write resolver output | 5 ms | Full results and stage timings saved |
| Resolver total | 17.624 s | 97 of the 107 names without Wikidata sites were deferred |

The same p019 resolver pass took 73.132 seconds and returned 6 Wikidata plus 7 search-engine candidates. The bounded replay was 55.508 seconds (75.9%) faster at the resolver stage and returned 6 Wikidata plus 2 search-engine candidates. This trades coverage for speed; it is not a quality-equivalent comparison. The eight URLs were not first-party verified, and no company batch was shaped or imported. See `company-batches/p024-domain-resolution-10-2026-11-07/timing-report.json` and `resolver-output.json` for the run record.

### Bing-only bounded replay — November 7, 2026

Run: `p025-domain-resolution-10-bing-2026-11-07`, using the same 113 saved p019 unresolved leads, ten selected company searches, concurrency 8, and cache disabled.

| Stage | Measured time | Result |
|---|---:|---|
| Bulk Wikidata | 1.082 s | 6 suggestions; same 113-name pool |
| Bing-only live search | 638 ms wall | 10 requests; 2 candidate sites; 0 errors |
| Summed per-name search time | 3.683 s | Overlapping worker time |
| Resolver total | 1.736 s | 6 Wikidata + 2 Bing candidates; 97 deferred |

Compared with p024's DDG-then-Bing order, Bing-only reduced resolver wall time by 90.1% and live-search wall time by 96.2%, while returning the same 8 raw site candidates in this 10-search sample. The earlier 84.187 worker-seconds fell to 3.683; worker-seconds are not wall-clock seconds. p024 recorded two requests for every candidate and a near-uniform 8.4-second duration; p019's seven search candidates and p024's two came from Bing. Because p024 did not time engines separately, DDG's 8-second request timeout is the likely source of most of that delay; p025 measured Bing at 162–477 ms. Keep per-engine timings so this inference can be checked as provider behavior changes. URLs remain unverified; no companies were imported. See `company-batches/p025-domain-resolution-10-bing-2026-11-07/timing-report.json`.

### What the benchmark teaches

- **Comparison is not the bottleneck.** Comparing 593 names took milliseconds after a roughly two-second Mongo snapshot read. More threads on this step would not materially improve the run.
- **Per-name site search is the largest measured delay.** The p019 resolver stage used 73.13 seconds across 113 unresolved names and yielded 7 DDG/Bing candidates plus 6 bulk Wikidata suggestions. Prefer sources that include official domains or a profile page with the employer's site; limit live fallback to promising, deduplicated leads.
- **The 13 candidates were not all search-engine results.** The saved p019 resolver output has 6 Wikidata suggestions, 7 DDG/Bing candidates, and 100 unresolved names. That makes the live-search candidate yield 7/113 (6.2%); the resolver's 73.13 seconds included both the bulk lookup and per-name searches.
- **Verification is the next cost.** Checking 329 sites took about 37 seconds, but it rejected most candidates on first-party fit/location evidence. Better source quality will improve accepted companies per minute more than increasing verifier concurrency alone.
- **Novelty is not fit.** Sources yielded many names absent from the catalog. Some lanes had low official evidence yield. Track both duplicate rate and strict pass rate, and replace lanes that stay below the profile's 15% pause threshold after 20 checks.
- **Profile-first extraction is worthwhile.** It processed 313 profile pages in about eight seconds and found sites for 202 candidates. That avoids many individual search requests, though those sites still need first-party verification.
- **Stored research can be fast but is mostly exhausted.** The p021 and p022 name/domain passes completed in about two seconds each, but saved candidates were largely already in Mongo or failed a current evidence recheck. Reuse local records for cheap screening; source genuinely new employers for the next batch.
- **Fresh ATS does not guarantee novelty.** The p023 current posting sample was mostly catalog duplicates, and its only name-level survivor failed first-party verification. Query new ATS/company segments, then stop as soon as the novelty ledger shows the source is already covered.

### Domain-resolution improvement strategy

The first optimization targets repeated and low-yield network work; hash-map comparison remains unchanged because its measured cost is negligible.

1. Capture official `website`, `domain`, source URL, and profile URL in the source fetcher whenever they are available. This avoids a separate profile/search pass and improves provenance.
2. After one bulk name-dedupe pass, run profile extraction only for unique leads with a profile URL and no site. Batch-check the remaining names against Wikidata.
3. Cache successful domain candidates by normalized company name plus region for 180 days. Cache a full-search no-match for 14 days. Cache entries are suggestions only: verify the official site and fit/location evidence again before adding a company.
4. Bound per-company search with `--domain-search-budget N`. A bounded run defaults to Bing-only; the p019 and p024 successful search candidates all came from Bing, and p025 returned the same candidate count with half the provider requests. Use `--domain-search-engine both` to add the DDG fallback. The resolver ranks explicit Costa Rica evidence first, then LATAM evidence, then source lanes with those signals. It adds the existing Mongo `preferenceContrast` only when lead metadata matches a model, track, or role family; the preference adjustment is capped at ±6 ranking points and cannot outweigh the geography tiers. Deferred leads remain in the output with a manual-review status. With no search budget, full-coverage both-engine search remains the default. Use `--no-domain-cache` for a clean timing comparison.
5. Keep search concurrency configurable and benchmark 8, 12, and 16 workers with engine request count, wall time, timeout/rate-limit count, and candidate yield. Do not raise the default until the measurements show the providers tolerate it.
6. Record more specific like/dislike reasons over time. The current contrast rates are still soft; use them to order searches only, never as a company exclusion or a replacement for fit/location evidence.

The resolver writes timings for input/cache matching, Wikidata, live search, cache persistence, and output. The collector records cache hits/misses, actual per-name searches, deferred searches, resolver timings, and the remaining run-wide search budget per slice.

**Implementation status:** the cross-run domain cache, geography- and preference-prioritized search budget, run-wide budget plumbing, engine selection, and per-engine timings are implemented in the local scripts. The collector passes the Mongo-derived `preferenceContrast` into domain resolution; only lead fields that match its model, track, or role-family labels affect order. In the same uncached 10-search replay, Bing-only took 1.736 seconds total versus 17.624 seconds with DDG then Bing, with the same raw candidate count. This is a small timing sample, not a verified-company quality claim; 97 names were deferred. The cache's repeat-run benefit remains unmeasured.

## Product roadmap for very large workloads

These are design goals, not features or performance claims already delivered.

1. **Keep separate company and job identities.** Canonicalize an employer by verified root domain with aliases and historical domains; canonicalize a job by employer ID plus ATS/posting ID. Use a stable content fingerprint only when a source has no durable posting ID.
2. **Stream and batch.** Ingest leads in bounded chunks, normalize and deduplicate before storing large page bodies, and apply backpressure to slow sources. Avoid loading hundreds of millions of full records into one JavaScript process.
3. **Partition exact indexes.** Hash canonical IDs into shards so searches and inserts can run in parallel across machines. A compact persistent key-value or columnar index can hold exact identity keys; a Bloom filter can reduce storage lookups but must never be the final duplicate decision.
4. **Separate search from dedupe.** The exact hash index answers “have we seen this employer or posting?” A query-serving search index should be separate: partition searchable postings by title, skills, location, employer, and freshness; apply hard location/eligibility filters first, then rank the smaller eligible set.
5. **Use concurrency for network I/O.** Apply per-host limits, retries, timeouts, caches, and request coalescing. Use CPU workers only after measurements show normalization, scoring, or parsing—not network waits—has become the bottleneck.
6. **Cache evidence carefully.** Store canonical URL, content hash, fetch time, status, and evidence snippets. Reuse unchanged pages until a freshness window expires; refresh closed postings and location rules more often than stable company facts.
7. **Improve preference feedback.** Record a short reason when Allan likes or dislikes an employer, such as location, business model, role family, seniority, or company type. Learn soft weights from these reason codes instead of inferring intent from a single like/dislike label.
8. **Benchmark quality and cost with speed.** Track candidates per second, p50/p95 stage latency, memory, network requests per accepted company, duplicate precision/recall, accepted companies per source lane, and cost per accepted result. Keep a fixed benchmark cohort to compare improvements over time.

## Current feedback signal

The November 7, 2026 Mongo snapshot contained 67 likes and 107 dislikes. An earlier profile comparison found outsourcing more common among likes than dislikes (70% vs 53%) and the Nearshore track more common among likes (13% vs 3%). Treat these as small, soft signals. The records do not yet include why Allan made each decision, so they are not sufficient to make hard exclusions or confidently predict future choices.

## Reproducibility

The timed run's raw leads, source outputs, Mongo snapshot, dedupe ledgers, verification slices, and timing report are in `company-batches/p019-timed-2026-11-07/`. The run used `scripts/collect-and-dedupe-company-leads.mjs` with profile-first extraction. Its timing report distinguishes source fetch, snapshot/dedupe, profile extraction, search fallback, verification, final dedupe, shaping, preparation, and import stages. Import timings are zero/not applicable when the strict target is not reached.
