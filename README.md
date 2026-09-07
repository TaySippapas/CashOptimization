# KTB Cash and Route Optimization

Cash logistics dashboard for KTB branches, machines, and delivery routes in
Khon Kaen. React presents Unity Catalog data through FastAPI `/api/v2` endpoints;
client-side planning and mock fallbacks also support scenario and demo views.

## Repository

| Path | Purpose |
| --- | --- |
| `app.py`, `app.yaml` | FastAPI entry point and Databricks App configuration |
| `server/api/`, `server/schemas/` | HTTP handlers and validated request/response models |
| `server/repositories/` | V2 queries and row assembly by domain |
| `server/mappers/`, `server/warehouse.py` | Shared value conversions and pooled SQL access |
| `frontend/src/` | React pages, shared UI, domain logic, and styles |
| `frontend/dist/` | Committed production bundle served by FastAPI |
| `tests/` | Backend tests and SQL connection fakes |
| `scripts/` | Current schema setup, migrations, demo seeds, and archived tooling |
| `docs/` | Architecture, deployment, data contracts, and historical references |

## Local development

Copy `config.example.yaml` to `config.yaml` and fill in your workspace settings.
The local config is ignored by Git. Authenticate with your configured Databricks
profile for live data; credentials do not belong in the repository.

```sh
python -m pip install -r requirements-dev.txt
python -m uvicorn app:app --reload --port 8000
```

In a separate terminal:

```sh
cd frontend
npm ci
npm run dev
```

Vite serves the UI on port 5173 and proxies `/api` to port 8000. For the deployed
layout, run `npm run build` in `frontend/`, then open FastAPI on port 8000.
Keep the rebuilt `frontend/dist/` in the same commit as frontend changes.

## Checks

```sh
python -m pytest
cd frontend
npm test
npm run build
```

Backend tests use fakes and do not query Databricks. Frontend domain tests are
colocated as `*.test.ts` and discovered by Vitest.

## Documentation

- [Architecture and conventions](docs/architecture/conventions.md)
- [Deployment](docs/deployment.md)
- [Runtime data contract](docs/data/runtime-schema.md)
- [Upstream source mapping](docs/data/database-table-blueprint.md)
- [SQL setup and migrations](scripts/README.md)
- [Archived reports and pipeline designs](docs/archive/README.md)

Legacy `/api/*` endpoints remain in `app.py`, backed by `server/uc_repo.py`,
`server/sql_client.py`, and `server/mock.py`. The frontend uses `/api/v2/*`.
`server/uc_repo_v2.py` remains a compatibility import surface; new backend code
imports the appropriate module from `server/repositories/`.
