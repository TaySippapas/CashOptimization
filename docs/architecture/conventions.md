# Architecture and conventions

This describes the implemented structure. Frontend placement rules are defined
in [frontend/AGENTS.md](../../frontend/AGENTS.md).

## Backend

```text
app.py                       lifecycle, legacy endpoints, SPA serving
server/
  api/v2.py                  /api/v2 handlers
  schemas/v2.py              Pydantic request and response models
  repositories/
    common.py                table names and business-date resolution
    health.py                health and available dates
    branches.py              branch tracking and planner inputs
    machines.py              machine tracking
    cash_flow.py             flow history and denomination gaps
    routes.py                route summaries and execution stops
    fleet.py                 truck availability and route parameters
    overview.py              overview aggregates and period calculations
  mappers/common.py          shared coercion and UI enum mappings
  warehouse.py               pooled V2 SQL, cache, fan-out, lifecycle counters
  settings.py                config.yaml and environment settings
  uc_repo_v2.py              compatibility exports; no new implementation here
  uc_repo.py                 legacy flat-table queries
  sql_client.py              legacy unpooled SQL access
  mock.py                    legacy /api/plan fallback
tests/
  conftest.py                pytest fixtures and state isolation
  fakes.py                   reusable in-memory SQL doubles
  test_*.py                  behavioral tests
```

Handlers delegate to repositories. Repositories own domain queries and response
assembly; shared conversions live in `mappers/`. V2 does not import conversion
helpers from the legacy repository. Both pipelines retain their own connection
policies and share `sql_client.bare_hostname` for host normalization.

Use snake_case for Python modules, functions, and variables; PascalCase for
classes; UPPER_SNAKE_CASE for constants. Keep the `server/` package name so the
entry point and existing integrations remain recognizable.

## Frontend

```text
frontend/src/
  app/                       shell, navigation, manual React Router table
  pages/<route>/             pages and private _Component.tsx files
  components/                shared UI primitives, charts, maps
  domain/                    business logic and colocated *.test.ts tests
  api/                       backend and external routing clients
  hooks/                     shared React hooks
  types/                     domain contracts and barrel exports
  utils/                     formatting, geometry, color tokens
  storage/                   localStorage keys and persistence helpers
  mocks/                     active demo data and client planner
  styles/
    index.css                ordered imports; preserve cascade order
    base.css                 tokens, theme, global defaults
    layout/                  shell and body layout
    components/              shared dashboard, loading, input styles
    pages/                   feature styles and responsive rules
```

Components serving one page belong beside that page. Generic atoms and app-shell
infrastructure remain shared even with one direct consumer. Loading placeholders
live in the same module as the component they support. Promote a private
component when a second page needs it.

React Router uses the explicit table in `app/routes.tsx`; `[routeId]` is a folder
convention, not automatic routing. Use PascalCase for components, camelCase for
TypeScript helpers, and kebab-case for URL folders. Use the `@/` alias across
features and relative imports for private page components.

Keep CSS imports in `styles/index.css` ordered. Page and responsive rules can
depend on earlier shared declarations. The split preserves the original
cascade; do not alphabetize these imports.

## Data and operational tooling

Current SQL is divided into `scripts/sql/schema/`, `migrations/`, and `seeds/`.
Archived scripts live in `scripts/legacy/` and require the old schema or external
notebook environment. See the [script guide](../../scripts/README.md).

The [runtime contract](../data/runtime-schema.md) identifies required tables and
setup order. The upstream blueprint describes source mapping. `docs/archive/`
preserves superseded designs and reports.

## Generated and local files

Commit `frontend/dist/` because Databricks serves that bundle without building
it. Keep `frontend/public/` as the source of copied static assets. Ignore
`node_modules/`, Python caches, pytest caches, TypeScript build metadata, and
local workspace configuration.
