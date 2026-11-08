# Company batch history

Archived batches are grouped by date, then by workflow responsibility. Dates come from a filename or `generatedOn` metadata where available; file modification dates fill gaps.

- `discovery-and-curation`: leads, candidates, pools, unique sets, and curated inputs
- `deduplication`: dedupe ledgers
- `verification`: verified, resolved, and profile outputs
- `import-preparation`: final, approved, and import-ready batches
- `reporting`: manifests, snapshots, inspection notes, and reports
- `other`: supporting artifacts that do not fit those stages
- `batch-runs`: complete run folders kept intact

Provenance paths inside archived JSON were updated to point to the archived locations.