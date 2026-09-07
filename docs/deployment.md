# Deploy the Databricks App

The entry point is `python -m uvicorn app:app --host 0.0.0.0 --port 8000`,
configured in [app.yaml](../app.yaml). FastAPI serves committed `frontend/dist/`.
Node is needed to rebuild the UI, not to run the deployed Python app.

## Prepare

1. Replace warehouse resource and environment placeholders in `app.yaml` for
   the target workspace.
2. Grant the app warehouse and Unity Catalog access. Use the
   [runtime contract](data/runtime-schema.md) and [SQL guide](../scripts/README.md)
   to identify required tables.
3. Check the backend and rebuild the frontend:

```sh
python -m pip install -r requirements-dev.txt
python -m pytest
cd frontend
npm ci
npm test
npm run build
cd ..
```

Commit the rebuilt bundle with source changes. `requirements.txt` contains
runtime dependencies; `requirements-dev.txt` adds test dependencies.

## Upload and deploy

Use an authenticated Databricks CLI profile. Replace bracketed values below.
Create the app only on its first deployment.

```sh
databricks apps create <app-name> -p <profile>
databricks sync . /Workspace/Users/<user>/<app-name> -p <profile> --exclude .git --exclude frontend/node_modules --exclude .venv --exclude __pycache__ --exclude .pytest_cache --exclude .deepeval --exclude config.yaml
databricks apps deploy <app-name> -p <profile> --source-code-path /Workspace/Users/<user>/<app-name>
databricks apps get <app-name> -p <profile>
```

Verify `/api/v2/health`, available dates, and the dashboard after deployment.
V2 operational endpoints expect live warehouse data; some client views have
demo or derived fallbacks. `USE_UNITY_CATALOG=false` controls legacy endpoint
fallback and startup warm-up; it does not disable V2 queries.

## Configuration

Local development reads the ignored `config.yaml`. Deployment uses `app.yaml`
environment values. V2 overrides are `V2_CATALOG`, `V2_SCHEMA`, and
`V2_WAREHOUSE_ID`; otherwise values fall back to `APP_CATALOG`, `APP_SCHEMA`,
and `DATABRICKS_WAREHOUSE_ID` or local config. Pool/cache settings are documented
in [config.example.yaml](../config.example.yaml).

Demo seeds truncate and replace table contents. Deployment does not require
re-seeding an existing operational dataset.
