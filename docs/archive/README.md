# Historical references

These documents describe earlier pipelines, snapshots, or proposed inputs.
They are preserved as background, not as current deployment instructions.
Use the [runtime contract](../data/runtime-schema.md),
[architecture](../architecture/conventions.md), and [script guide](../../scripts/README.md)
for the implemented application.

| File | Historical purpose |
| --- | --- |
| `DATABRICKS_NEW_PIPELINE_PROCEDURE.md` | Original seven-table/staging pipeline proposal and performance notes |
| `dashboard-input-spec.md` | Deprecated sample-file-to-UI input mapping |
| `data_map_inventory.md` | July 2026 inventory for the older flat-table/view API |
| `UI_DATA_READINESS_REPORT.md` | Readiness snapshot for that older UI/pipeline |
| `ktb_contract.yaml` | Nine-entity view contract for the legacy API |

`REQUIRED_DATA_FORMAT.md` and `CUSTOMER_DATA_CONTRACT.md` referenced by old
material are not present in this repository. References to them are historical,
not prerequisites for current setup. External consumers of the YAML contract
must update their path to `docs/archive/ktb_contract.yaml` if still needed.
