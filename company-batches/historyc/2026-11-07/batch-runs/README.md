# Archived runs

Run folders are kept intact so each workflow's inputs, outputs, and timing reports stay together.

## Retained

- `company-site-crawl` — crawl snapshot used by the historical company review.
- `p019-timed-2026-11-07` through `p023-timed-2026-11-07` — collection and verification runs. Later runs reference outputs from earlier runs, so keep the chain together.
- `p025-domain-resolution-10-bing-2026-11-07` — latest retained domain-resolution run.

## Pruned

- `p018-timed-2026-11-07` — superseded and had no references outside its own run folder.
- `p024-domain-resolution-10-2026-11-07` — superseded by p025 and had no references outside its own run folder.

When adding a run, keep its complete folder intact and update this index. Before pruning an older run, check archived `sourceFile` references first.
