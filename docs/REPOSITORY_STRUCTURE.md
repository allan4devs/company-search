# Repository structure

The app keeps route entry points small and groups feature code by ownership. The
company directory lives under `app/_features/company-directory`; the leading
underscore makes it a private App Router folder, so its modules do not create
routes.

## Company directory

| Folder | Responsibility |
| --- | --- |
| `components` | Directory UI, separated by visible surface. |
| `context` | Client provider that connects data, preferences, and the view. |
| `constants` | Directory filters, groups, and browser storage keys. |
| `hooks` | Catalog loading, preference persistence/sync, and summary state. |
| `lib` | Small reusable functions with no React state. |
| `types.ts` | Shared view and summary types. |

Keep route files such as `app/page.tsx` and `app/api/**/route.ts` at their
current App Router locations. Route files should delegate feature work to
these modules.

## Other project areas

| Path | Responsibility |
| --- | --- |
| `lib/comp` | The Comp catalog, matching, category rules, and persistence. |
| `scripts` | Company discovery, crawl, verification, deduplication, and import tooling. |
| `company-batches` | Active review batches and retained research provenance. |
| `output` | Generated deliverables such as PDFs. |

The crawl snapshot from November 7, 2026 is archived at
`company-batches/historyc/2026-11-07/batch-runs/company-site-crawl/`. Its
crawler temp files are ignored. Historical company batches remain in the repo
because their source and deduplication records support reproducibility.

## Refactor sequence

The first pass moved directory-owned code into the feature folder, split shared
helpers by responsibility, removed an unused search worker and unused UI
components, and extracted the detail panel and group summary state from the
main view.

Next, reduce the remaining large modules in these steps:

1. **`CompanyDirectoryGroupSection.tsx`** — extract the catalog request,
   cancellation, retry, and summary effects into a data hook; keep paging and
   result rendering in the component.
2. **`use-company-directory-preferences.ts`** — separate the optimistic write
   queue from browser-tab synchronization. Preserve local fallback behavior,
   conflict ordering, and the existing storage keys.
3. **`CompanyDirectoryView.tsx`** — move selected-company and job-edit state
   into a view controller, leaving the page shell and filter wiring in the
   component.
4. **`app/api/comp/catalog/route.ts`** — move query parsing and response shaping
   into a server library after the UI refactor is stable.

For these steps, preserve API payloads, stored preference keys, batch formats,
and The Comp's matching and deduplication behavior. Run TypeScript and the
production build after each step so a structural refactor stays behavior
neutral.
