# Frontend-only demo mode

Development currently defaults to live backend data. An explicit **Mock · frontend only** mode remains available, with no `/api` requests to FastAPI or Databricks. There is no automatic mock fallback in live mode.

From `frontend/`:

```powershell
npm run dev          # Live mode by default (.env.development)
npm run dev:mock     # Explicit mock mode
npm run build:mock   # Standalone demo bundle in dist/
npm run preview     # Serve the most recently built bundle
```

To return to real data, start the backend separately and use `npm run dev:live`. `npm run build` remains the live production build; `build:mock` must be selected explicitly for a production-style demo bundle.

The demo covers Machines, Branches, Route Tracking/detail, both overviews, report date selection and downloads, all trend ranges, and Route Configuration. It generates 730 consecutive dates ending yesterday (UTC), so annual comparisons have two full years of planning snapshots. Values are deterministic for each entity and date, and machines include ATM, RCM and 3IN1 examples. This is synthetic demo data, not a downloaded Databricks snapshot.

Trend summaries use the same metric definitions as the backend, with totals, daily averages, weighted rates, percentage-point changes and missing-baseline handling. Actual flows are available through the day before the selected snapshot; forecasts and tracking cards use the same daily values. Mock forecasts are demonstration values, not ML outputs.

Route Configuration saves only to the browser's separate `cash-route-standalone-config-v1` localStorage key. Editable planning/scenario configuration also uses a separate `:mock` storage key. Those demo settings do not rewrite historical demo route plans or affect live data. Maps still use external map tiles/road geometry when available; running without the backend is supported, but full offline map rendering is not provided.

Implementation entry points: `frontend/src/api/client.ts` chooses live versus mock; `frontend/src/mocks/frontendApi.ts` handles local responses; `snapshots.ts` generates daily tracking data; `trends.ts` aggregates it. `trendMetrics.json` is a static copy of `server.repositories.trends.metrics_for` definitions and should be updated with any future backend metric changes.
