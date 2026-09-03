# Deploy to Another Databricks Workspace

Portable package for the **KTB Cash Route Optimization** Databricks App (React + FastAPI).

## Package contents

| Path | Purpose |
|------|---------|
| `app.yaml` | Databricks App entry (uvicorn) |
| `app.py` | FastAPI server + static SPA |
| `requirements.txt` | Python dependencies |
| `server/` | Backend logic (mock data; swap for UC/SQL later) |
| `frontend/dist/` | Pre-built React UI (no Node.js needed on workspace) |

## Prerequisites

- Databricks workspace with **Apps** enabled
- Databricks CLI v0.229+ configured (`databricks auth login`)
- Permission to create Apps in the target workspace

## Quick deploy

```bash
# 1. Unzip and enter the app root (folder containing app.yaml)
unzip ktb-cash-optimization-deploy.zip
cd ktb-cash-optimization

# 2. Set your profile and workspace user path
export DB_PROFILE=your-profile
export WORKSPACE_USER=your.email@company.com
export APP_NAME=ktb-cash-optimization
export REMOTE_PATH=/Workspace/Users/${WORKSPACE_USER}/${APP_NAME}

# 3. Create the app (first time only)
databricks apps create ${APP_NAME} -p ${DB_PROFILE}

# 4. Upload source to workspace
databricks sync . ${REMOTE_PATH} \
  -p ${DB_PROFILE} \
  --exclude .git --exclude node_modules --exclude .venv

# 5. Deploy
databricks apps deploy ${APP_NAME} \
  --source-code-path ${REMOTE_PATH} \
  -p ${DB_PROFILE}

# 6. Open the app URL
databricks apps get ${APP_NAME} -p ${DB_PROFILE} --output json | jq -r .url
```

## Optional: SQL warehouse resource

If you later wire `/api/plan` to Unity Catalog, grant the app a SQL warehouse in the Apps UI or via API:

```bash
databricks apps update ${APP_NAME} -p ${DB_PROFILE} --json '{
  "resources": [{
    "name": "sql-warehouse",
    "description": "SQL warehouse for forecast queries",
    "sql_warehouse": { "id": "<warehouse-id>", "permission": "CAN_USE" }
  }]
}'
```

## Verify locally (optional)

```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
# open http://localhost:8000
```

## Rebuild frontend (only if you modify UI source)

This zip ships **pre-built** `frontend/dist/`. To rebuild from source you need the full repo with `frontend/src/` and Node.js 18+:

```bash
cd frontend && npm install && npm run build
```

## App pages

- Overview, Machines, Branches, Route Tracking, Truck Detail
- Optimization, AI Performance, Alerts, Scenario, Reports
- Configure Inputs (branch/machine config via browser localStorage)

## Notes

- Default data is **mock** (client-side + `server/mock.py`). No UC tables required for first deploy.
- Config is stored in the browser (`localStorage`); clearing cache resets inputs.
- Compute size: **SMALL** is usually enough; use MEDIUM if you add heavy OR-Tools solves server-side.
