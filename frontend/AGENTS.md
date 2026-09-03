# Frontend structure — rules for adding code

This file governs `frontend/src/`. Follow it when creating or moving any
component, hook, or helper function. The goal is a predictable place for
everything so both humans and AI coding agents put new code in the same spot
without having to re-derive the convention each time.

## Where new code goes

| Kind of code | Location |
|---|---|
| React component used by **2+ pages**, or a generic UI atom (button, badge, dot, skeleton primitive) | `src/components/Name.tsx` |
| React component used by **exactly 1 page** | `src/pages/<page>/_Name.tsx` (underscore prefix, colocated with the page) |
| Component group sharing a domain (charts, maps) once there are 3+ files | `src/components/<domain>/` subfolder |
| Business logic, derived/computed types, color/status lookup maps | `src/domain/*.ts` |
| Pure calculation or formatting function (no JSX, no React) | `src/utils/*.ts` |
| Shared React hook | `src/hooks/*.ts` |
| App-shell / layout infra consumed by `App.tsx` directly (not a page) | `src/components/Name.tsx`, even at 1 consumer (e.g. `PageLoader.tsx`) |

Decision order when adding a new render function:

1. Does it hold no JSX and just compute/format a value? → `utils/` (or
   `domain/` if it encodes business rules, e.g. a status→color map).
2. Is it JSX consumed by more than one page today? → `components/`.
3. Otherwise → `pages/<page>/_Name.tsx`, default-exported, imported with a
   relative path (`./_Name`) from the page that owns it.

## The promotion rule

A `_Name.tsx` file is private to its page **only until a second page needs
it**. When that happens:

1. `mv pages/<page>/_Name.tsx components/Name.tsx` (drop the underscore).
2. Fix any relative imports inside the file (`./Skeleton` →
   `@/components/Skeleton`, etc.) — page-local files may import shared
   pieces by relative path if convenient, but a promoted file must use the
   `@/components/...` alias.
3. Update every importer to `@/components/Name`.
4. If the component's props reference a page-specific domain type, consider
   whether that type should also move to `domain/` first — a shared
   component should not depend on a single page's local types.

Do **not** move something to `components/` preemptively "in case it's
reused later." Wait for the second real consumer, then promote. This keeps
`components/` an honest signal of what's actually shared, and keeps
newcomers (human or agent) from having to guess whether a file in
`components/` is safe to change for one page's needs.

## Naming

- Files in `components/` are shared, public API — name them clearly
  (`ScenarioAssumptionInput`, not `Sc`). No abbreviations.
- Files in `pages/<page>/_Name.tsx` are page-scoped — terser names are fine
  since the page name already gives context, but keep them descriptive
  enough to grep for.
- A component and its loading placeholder live in the **same file**: the
  real component is the default export, the skeleton is a named export
  prefixed `Skeleton` (e.g. `KpiCard.tsx` exports both `default KpiCard` and
  `SkeletonKpiCard`). Do not create a separate file just for a skeleton.

## Colors

Never hardcode a hex value in a component or page. Use `COLOR` from
`@/utils/colors.ts`, or a domain-level status/color map in `src/domain/`
(e.g. `RISK_COLOR`, `ROUTE_STATUS_COLOR`) when the mapping encodes a
business rule rather than a raw design token.

## Current shared inventory (`components/`)

Everything here has 2+ consumers, or is app-shell infra:

- `KpiCard` / `SkeletonKpiCard`, `StatBox` / `SkeletonStatBox` — metric
  cards used across most data pages
- `Skeleton` — the shimmer primitive every loading state is built from
- `Pill`, `StatusDot`, `TrendIcon`, `SparkLine` — small shared atoms
- `PageLoader` — route-level Suspense fallback, owned by `App.tsx`
- `charts/`, `maps/` — domain-grouped shared chart and map components

If you're about to add a file here, confirm it actually has (or will
immediately have) 2+ consumers — otherwise it belongs under `pages/`.
