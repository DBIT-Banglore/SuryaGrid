# SuryaGrid AI — Documentation Index

A guide to every document in `docs/`. Each entry has a one-line summary and a
"when to read this" note so you can find what you need quickly.

> **Start here if you're new:** [README.md](../README.md) →
> [APP_FLOW.md](APP_FLOW.md) → [ARCHITECTURE.md](ARCHITECTURE.md) →
> [FORMULA_SOURCES.md](FORMULA_SOURCES.md).

---

## Quick navigation by topic

| I want to know about… | Read this |
|---|---|
| What the project does | [README.md](../README.md) |
| How the app flows end-to-end | [APP_FLOW.md](APP_FLOW.md) |
| System architecture and components | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Every formula and its source | [FORMULA_SOURCES.md](FORMULA_SOURCES.md) |
| DSM rules and tariff framework | [DSM_RULE_SOURCES.md](DSM_RULE_SOURCES.md) |
| Where data comes from (provenance) | [SOURCE_REGISTRY.md](SOURCE_REGISTRY.md) |
| The 12 agents and their workflows | [AGENT_WORKFLOWS.md](AGENT_WORKFLOWS.md) |
| Substation-driven workflow (dropdown) | [SUBSTATION_DRIVEN_AGENT_WORKFLOW.md](SUBSTATION_DRIVEN_AGENT_WORKFLOW.md) |
| DSM input trace for a substation | [DSM_SUBSTATION_INPUT_TRACE.md](DSM_SUBSTATION_INPUT_TRACE.md) |
| API endpoints | [API_REFERENCE.md](API_REFERENCE.md) |
| Data source catalog | [DATA_SOURCE_CATALOG.md](DATA_SOURCE_CATALOG.md) |
| ML pipeline and training | [ML_PIPELINE.md](ML_PIPELINE.md) |
| Kaggle dataset selection | [KAGGLE_DATASET_SEARCH_AND_SELECTION.md](KAGGLE_DATASET_SEARCH_AND_SELECTION.md) |
| Kaggle training results | [KAGGLE_TRAINING_RESULTS.md](KAGGLE_TRAINING_RESULTS.md) |
| Kaggle dataset schema | [KAGGLE_DATASET_SCHEMA_REPORT.md](KAGGLE_DATASET_SCHEMA_REPORT.md) |
| Bengaluru ML (Phase 1.7) | [REAL_DATA_PHASE1_7_BENGALURU_ML.md](REAL_DATA_PHASE1_7_BENGALURU_ML.md) |
| Locations & substation data | [LOCATION_AND_SUBSTATION_DATA.md](LOCATION_AND_SUBSTATION_DATA.md) |
| Docker setup | [DOCKER_ARCHITECTURE.md](DOCKER_ARCHITECTURE.md) |
| Deployment (AWS/Terraform) | [DEPLOYMENT.md](DEPLOYMENT.md) |

---

## Document catalogue

### Getting started & overview

| Document | Summary | When to read |
|---|---|---|
| [README.md](../README.md) | Project overview, honesty principles, formulas, data sources, quick start, live demo. | First. Always. |
| [APP_FLOW.md](APP_FLOW.md) | End-to-end user flow, page-by-page description, DSM logic walkthrough. | To understand what each page does. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture, data flow, agent layer, persistence, API design. | To understand the technical design. |
| [API_DESIGN.md](API_DESIGN.md) | API design principles, envelope format, error handling. | When building or consuming the API. |
| [API_REFERENCE.md](API_REFERENCE.md) | Full API reference — all 61 endpoints with request/response schemas. | When integrating with the backend. |

### Formulas & provenance

| Document | Summary | When to read |
|---|---|---|
| [FORMULA_SOURCES.md](FORMULA_SOURCES.md) | Every formula used in the numeric path with source classification (OFFICIAL_SOURCE, MODEL_LEARNED, FALLBACK_DEFAULT, etc.) and code references. 13 sections covering irradiance decomposition, POA, clear-sky, cell temp, PVWatts, inverter, confidence, DSM deviation, dynamic risk, fuzzy risk, ML metrics. | To understand any formula or verify its source. |
| [SOURCE_REGISTRY.md](SOURCE_REGISTRY.md) | Full source registry with IDs, classifications, and URLs for every data source. | To verify where a piece of data comes from. |
| [DSM_RULE_SOURCES.md](DSM_RULE_SOURCES.md) | DSM regulatory framework sources — KERC, CERC, deviation settlement rules, slab rates. | To understand the DSM tariff framework. |
| [formulas.md](formulas.md) | Legacy formula reference (superseded by FORMULA_SOURCES.md but retained for history). | Historical reference only. |

### Agents & workflows

| Document | Summary | When to read |
|---|---|---|
| [AGENT_WORKFLOWS.md](AGENT_WORKFLOWS.md) | All 12 agents with purpose, inputs, outputs, tables, errors, retry, tests, and upgrade paths. Both the full run and the substation-driven workflow. | To understand what each agent does. |
| [AGENT_ARCHITECTURE.md](AGENT_ARCHITECTURE.md) | Agent architecture design — how agents coordinate, sequencing, error propagation. | To understand agent interactions. |
| [SUBSTATION_DRIVEN_AGENT_WORKFLOW.md](SUBSTATION_DRIVEN_AGENT_WORKFLOW.md) | The substation-driven workflow: context object, 7-step pipeline, API endpoints, example response, honesty guarantees. | To understand the dropdown workflow. |
| [DSM_SUBSTATION_INPUT_TRACE.md](DSM_SUBSTATION_INPUT_TRACE.md) | Full DSM input trace showing which fields are real, estimated, or blocked for a substation. | To understand DSM field provenance. |

### Data sources & ML

| Document | Summary | When to read |
|---|---|---|
| [DATA_SOURCE_CATALOG.md](DATA_SOURCE_CATALOG.md) | Catalog of all data sources (Open-Meteo, NLR NSRDB, Kaggle, OSM) with roles and access methods. | To understand what data feeds the platform. |
| [ML_PIPELINE.md](ML_PIPELINE.md) | ML pipeline design — training, evaluation, model selection, hybrid mode. | To understand the ML path. |
| [KAGGLE_DATASET_SEARCH_AND_SELECTION.md](KAGGLE_DATASET_SEARCH_AND_SELECTION.md) | How Kaggle datasets were searched and selected for Bengaluru solar/irradiance/load. | To understand dataset selection rationale. |
| [KAGGLE_DATASET_SCHEMA_REPORT.md](KAGGLE_DATASET_SCHEMA_REPORT.md) | Schema of the selected Kaggle datasets — columns, types, units, provenance. | To understand the Kaggle data structure. |
| [KAGGLE_TRAINING_RESULTS.md](KAGGLE_TRAINING_RESULTS.md) | Training results, model cards, metrics (R², MAE, F1, ROC-AUC) for all models. | To understand model performance. |
| [BENGALURU_DATA_AND_ML_PIPELINE.md](BENGALURU_DATA_AND_ML_PIPELINE.md) | Bengaluru-specific data and ML pipeline overview. | To understand the Bengaluru data path. |
| [BENGALURU_DATA_SOURCE_RESEARCH.md](BENGALURU_DATA_SOURCE_RESEARCH.md) | Research into Bengaluru-specific data sources (BESCOM, KERC, CEA, satellite). | To understand what real data is available. |
| [REAL_DATA_PHASE1_5.md](REAL_DATA_PHASE1_5.md) | Phase 1.5 real-data milestone: Open-Meteo, pvlib, substation catalog. | To understand the Phase 1.5 scope. |
| [REAL_DATA_PHASE1_7_BENGALURU_ML.md](REAL_DATA_PHASE1_7_BENGALURU_ML.md) | Phase 1.7: Kaggle ingestion, Bengaluru-trained models, model cards, retrain commands. | To understand the ML training. |

### Substations & locations

| Document | Summary | When to read |
|---|---|---|
| [LOCATION_AND_SUBSTATION_DATA.md](LOCATION_AND_SUBSTATION_DATA.md) | How substation data is collected from OSM, the parquet catalog, reliability scoring. | To understand the 344-substation catalog. |
| [substation_data_quality_report.md](substation_data_quality_report.md) | Data quality analysis of the OSM substation data (field coverage, missing values). | To understand data quality issues. |

### Deployment & infrastructure

| Document | Summary | When to read |
|---|---|---|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deployment guide — AWS ECS/Terraform, single-instance, environment variables. | When deploying the app. |
| [DOCKER_ARCHITECTURE.md](DOCKER_ARCHITECTURE.md) | Docker Compose architecture, services, networking, volumes, port mappings. | To understand the container setup. |
| [SECURITY_PLAN.md](SECURITY_PLAN.md) | Security plan — API keys, rate limiting, CORS, input validation. | To understand security measures. |

### Validation & reports

| Document | Summary | When to read |
|---|---|---|
| [PHASE1_SYSTEM_VALIDATION.md](PHASE1_SYSTEM_VALIDATION.md) | Phase 1 system validation results. | To understand the validation process. |
| [tariff_and_dsm_source_verification.md](tariff_and_dsm_source_verification.md) | Verification of tariff and DSM sources against official KERC/CERC documents. | To understand tariff provenance. |
| [EXECUTION_PLAN.md](EXECUTION_PLAN.md) | Execution plan — phases, milestones, tasks, status. | To understand project progress. |

---

## Frontend pages ↔ formulas reference

Every frontend page now includes inline "How it works" and formula cards. Here's which
formulas appear on which page, so you can cross-reference with [FORMULA_SOURCES.md](FORMULA_SOURCES.md):

| Page | Formulas shown |
|---|---|
| **Dashboard** | Irradiance closure, PVWatts, DSM deviation, confidence score |
| **Generation Timeline** | POA transposition, Faiman cell temp, DC/AC power, DSM per-interval deviation |
| **ML Forecasting** | ML target, irradiance→generation, MAE, R², RMSE, MAPE |
| **DSM Engine** | DSM deviation (interval-normalized), dynamic risk score, slab charges, fuzzy risk, irradiance closure, KERC band |
| **Data Sources** | OFFICIAL_SOURCE, DATASET_DERIVED, MODEL_LEARNED, FALLBACK_DEFAULT classification formulas |
| **Locations & Substations** | Reliability score, haversine distance, SubstationContext structure, agent workflow pipeline |
| **Energy Balance** | Hourly production (pvlib), surplus/deficit, self-consumption ratio, grid export/import |
| **Settlement Engine** | Hourly penalty, hourly bonus, consumer discount, net owner settlement, RL reward (REINFORCE) |
| **Karnataka · BESCOM** | KERC band, slab charges, chargeable energy, dynamic risk score |
| **RL Lab** | REINFORCE policy gradient, reward function, state space, action space, hourly production (digital twin), confidence |
| **Scenario Analysis** | PVWatts, DSM deviation per scenario, penalty cost estimate, fuzzy risk classification |
| **System Status** | (No formulas — architecture and agent inventory only) |
| **Home** | Pipeline diagram (6-stage agent flow) |
| **SubstationWorkflowPanel** | Reliability score, irradiance closure, PVWatts, DSM deviation, dynamic risk, haversine |

---

## Agent → formula cross-reference

| Agent | Key formulas | Formula section |
|---|---|---|
| WeatherAgent | Live GHI/DNI/DHI fetch, caching | [FORMULA_SOURCES.md §1](FORMULA_SOURCES.md#erbs) (Erbs decomposition) |
| SolarIrradianceAgent | Erbs decomposition, POA transposition, clear-sky | [§1](FORMULA_SOURCES.md#erbs), [§2](FORMULA_SOURCES.md), [§3](FORMULA_SOURCES.md) |
| CloudRiskAgent | Cloud-drop probability from cloud cover | [§8](FORMULA_SOURCES.md#confidence) (confidence) |
| GenerationTimelineAgent | Faiman cell temp, PVWatts DC, inverter AC | [§4](FORMULA_SOURCES.md#faiman), [§5](FORMULA_SOURCES.md), [§6](FORMULA_SOURCES.md#inverter) |
| ForecastAgent | Forecast modes (formula/ml/hybrid), confidence | [§7](FORMULA_SOURCES.md#irradiance-to-gen), [§8](FORMULA_SOURCES.md#confidence) |
| DSMEngineAgent | Interval-normalized deviation, slab charges, dynamic risk | [§9](FORMULA_SOURCES.md), [§11](FORMULA_SOURCES.md#dynamic-risk-score) |
| FuzzyRiskAgent | Fuzzy membership functions, LOW/MED/HIGH/CRITICAL | [§12](FORMULA_SOURCES.md#fuzzy) |
| FeatureEngineeringAgent | Unit conversions, augmented dataset | [§10](FORMULA_SOURCES.md#unit-conversions) |
| SubstationContextAgent | Reliability score, missing-field handling | [§11](FORMULA_SOURCES.md#dynamic-risk-score) (reliability) |
