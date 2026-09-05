# Project Structure & Naming Conventions

Status: **frontend implemented; backend agreed, not yet implemented.**

This documents the target structure for the
`backend/` and `frontend/` restructure before any files are moved.

## Frontend structure

```
frontend/src/
├── app/
│   ├── App.tsx               ← sidebar, theme, providers only
│   ├── routes.tsx            ← manual route table (see Routing below)
│   └── nav.ts
├── pages/                    ← mirrors the URL tree, one folder per route
│   ├── overview/
│   ├── machines/
│   │   └── [atmId]/          ← human-readable convention for a param sub-route;
│   │                           actual param comes from routes.tsx
│   ├── branches/
│   ├── routes/
│   │   └── [routeId]/
│   ├── optimization/
│   ├── ai-performance/
│   ├── alerts/
│   ├── scenario/
│   └── reports/
├── components/                ← reusable only, grouped by what they render
│   ├── charts/                 TrendChart, ComparisonChart, DenominationChart
│   ├── maps/                   MapView, HealthMap, RoutePathMap
│   └── ui/                     KpiCards, BranchTable, RoutePanel
├── domain/                    ← shared business logic and constant
│   routeExec.ts  tracking.ts  scenario.ts  executiveOverview.ts
│   alertsData.ts  reportsData.ts  aiPerformance.ts
├── api/
│   ├── backend.ts             ← backend api
│   └── osrm.ts                ← external OSRM routing service
├── utils/                     ← helper functions
│   ├── format.ts
│   └── geo.ts                  (haversine / drive-time math)
├── storage/
│   ├── keys.ts                 all localStorage key strings, defined once
│   ├── configStore.ts
│   └── machineStore.ts
├── mocks/
│   ├── mockData.ts
│   └── branches.ts
├── hooks/
│   └── useTheme.ts
├── types/                      ← split by domain
│   ├── plan.ts                 Branch, BranchInput, RoutePlan, ExecMetrics, PlanBundle, OptimizerParams, AppConfig
│   ├── tracking.ts             Machine, MachineInput, BranchTrack, Health, TrackAction, RiskLevel, Denomination, DayFlow
│   ├── route-exec.ts           RouteExecution, RouteStopExec, RouteStatus, StopType, StopStatus
│   └── index.ts                barrel re-export
└── styles/
    └── index.css
```

### Routing

React Router with a manual route table (`app/routes.tsx`).

Reasoning: this app has a small, slow-growing page count,
so a manual table stays more explicit and debuggable for less cost. Nested detail
routes (`/machines/:atmId`, `/routes/:routeId`) are expressed directly in the table:

```tsx
{ path: "/machines", element: <MachinesPage /> },
{ path: "/machines/:atmId", element: <AtmDetailPage /> },
```

## Backend structure

```
backend/                       ← renamed from server/
├── app.py
├── core/
│   ├── config.py              ← was settings.py
│   └── datasource.py          ← UC-or-mock fallback policy, written once
├── api/
│   ├── health.py  config.py  machines.py  branches.py  routes.py  plan.py
├── schemas/                   ← Pydantic — the single response contract
│   ├── common.py  machine.py  branch.py  route.py  plan.py
├── repositories/
│   ├── sql_client.py
│   ├── machine_repo.py  branch_repo.py  route_repo.py  app_settings_repo.py
├── mappers/                   ← the four concerns currently tangled in uc_repo.py
│   ├── coercion.py            (_num, _int, _bool, _date_str, _day_label)
│   ├── enums.py               (_ACTION_UI, _HEALTH_UI, _RISK_UI, _ROUTE_STATUS_UI, _STOP_TYPE_UI, _STOP_STATUS_UI)
│   ├── machine_mapper.py  branch_mapper.py  route_mapper.py
├── mock/
│   └── mock.py
└── web.py                     ← SPA static-file serving (assets mount + catch-all)
```

`scripts/` and `dataplug/` stay at repo root, unchanged — one-off admin/seeding
tooling that runs outside the deployed app process, not part of the FastAPI package.

## Naming conventions

### Frontend (TypeScript / React)

| Element                    | Convention                                               | Example                                            |
| -------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| Page component file        | PascalCase `XxxPage.tsx`, inside kebab-case route folder | `pages/ai-performance/AiPerformancePage.tsx`       |
| Reusable component file    | PascalCase                                               | `TrendChart.tsx`, `HealthMap.tsx`                  |
| Non-component `.ts` file   | camelCase                                                | `format.ts`, `machineStore.ts`, `backend.ts`       |
| Route folder (URL segment) | kebab-case                                               | `pages/ai-performance/`, `pages/machines/[atmId]/` |
| Component name             | PascalCase                                               | `TrendChart`                                       |
| Function name              | camelCase, verb-first                                    | `buildPlanFromConfig`, `fetchMachinesFromApi`      |
| Variable / prop            | camelCase                                                | `showOptimized`, `predictedEod`                    |
| Boolean variable / prop    | `is` / `has` / `should` prefix                           | `isDepot`, `hasError`                              |
| Type / interface           | PascalCase, no `I` prefix                                | `Branch`, `RouteExecution`                         |
| Module-level constant      | UPPER_SNAKE_CASE                                         | `NAV_ITEMS`, `DEFAULT_ROAD_FACTOR`, `STORAGE_KEY`  |
| CSS class                  | kebab-case                                               | `nav-tab`, `sidebar-toggle`                        |
| localStorage key           | `ktb-<domain>-v<n>`, defined once in `storage/keys.ts`   | `ktb-cash-route-config-v1`                         |

### Backend (Python)

| Element                 | Convention                                                                                      | Example                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Module file             | snake_case                                                                                      | `machine_repo.py`, `sql_client.py`             |
| Function name           | snake_case, verb-first                                                                          | `fetch_machines`, `resolve_business_date`      |
| Route handler name      | verb + resource (not bare noun — avoids shadowing the resource/schema name)                     | `get_machines`, `get_branches`, `get_plan`     |
| Internal/private helper | leading underscore                                                                              | `_num`, `_resolve_business_date`               |
| Class name              | PascalCase                                                                                      | `AppSettings`                                  |
| Pydantic schema class   | plain domain noun (file already namespaces it; no `Out`/`Dto` suffix — endpoints are read-only) | `Machine`, `Branch`, `RouteExecution`          |
| Variable                | snake_case                                                                                      | `business_date`, `warehouse_id`                |
| Module constant         | UPPER_SNAKE_CASE                                                                                | `ROAD_FACTOR`, `COST_PER_KM_THB`               |
| Env var                 | `APP_*` / `DATABRICKS_*` prefix, SCREAMING_SNAKE                                                | `APP_BUSINESS_DATE`, `DATABRICKS_WAREHOUSE_ID` |

Both conventions match what the existing codebase already does in most places
(`buildPlanFromConfig`, `NAV_ITEMS`, `isDepot`, `_num`, `AppSettings`,
`ROAD_FACTOR`) — this codifies it and extends it to the new files, rather than
introducing a new style.

## Code ordering (frontend)

Within a `.ts`/`.tsx` file:

1. Imports
2. Helper functions (module-level, not exported, used by the main function below)
3. The main exported function/component

Within a component/function body:

1. Hooks and state (`useState`, `useParams`, `useAppData()`, prop/context destructuring)
2. Derived values — plain `const`s and `useMemo`, computed from the state above
3. `useEffect`
4. Event handlers / other inner functions
5. `return`

Rationale: hooks must run unconditionally at the top (React's rules of hooks
already force this); grouping derived values next means anything the JSX
reads is declared before the side-effecting code that reacts to it, so
`useEffect` bodies read top-to-bottom as "given the state above, do this."

## Proposed follow-ups (not yet decided / not yet applied)

These came up during review but are separate from the structure/naming decisions
above and haven't been explicitly confirmed:

- **Mock duplication**: `backend/mock/mock.py`)
  is a hand-port of `frontend/src/mocks/mockData.ts` — same seeded RNG, same
  haversine/2-opt, same hard-coded branches, maintained twice in two languages.
  Candidate fix: backend owns `build_plan()` as the single source, frontend
  consumes `/api/plan` only, TS solver in `mockData.ts` is deleted.
- **Dead code**: `InputPage.tsx` (13.9 KB) and `routeStore.ts` are confirmed
  unreferenced by grep. Frontend structure above already omits `routeStore.ts`.
- **Contract docs**: `CUSTOMER_DATA_CONTRACT.md`, `DASHBOARD_INPUT_SPEC.md`,
  `REQUIRED_DATA_FORMAT.md` (67 KB combined) overlap with each other and with
  `dataplug/ktb_contract.yaml`. Once `backend/schemas/` (Pydantic) exists as the
  real contract, these could be consolidated or reduced to prose pointing at it.
