# SuryaGrid AI — Bengaluru Solar Forecasting, Substation Intelligence & DSM Risk

A **real-data, multi-agent** platform for Bengaluru / Karnataka that turns a selected grid
**substation** into live solar-generation forecasts and **Deviation Settlement Mechanism (DSM)**
risk — with a hard rule that runs through the whole codebase: **every number is traceable to a
real source, and nothing is ever fabricated.** Missing data stays missing (and is labelled),
estimates are labelled as estimates, and there are no invented rupee charges.

> Python 3.12 · FastAPI · pvlib · scikit-learn · SQLAlchemy · Redis · Next.js 14 / React / Tailwind · Docker

---

## Honesty principles (the core of the project)

1. **No fabrication.** A missing real field (substation capacity, voltage, district, load,
   tariff) is returned as `null` with a `*_status = NOT_AVAILABLE` — never a plausible guess.
2. **Provenance on everything.** Each value carries a label: `REAL_BENGALURU`, `REAL_KARNATAKA`,
   `REAL_INDIA`, `REAL_COORDINATE_BASED`, `ESTIMATED_FROM_REAL`, `NOT_AVAILABLE`,
   `NEEDS_OFFICIAL_SOURCE`, … (`docs/SOURCE_REGISTRY.md`).
3. **`APP_DATA_MODE=real` forbids synthetic fallback.** If live weather is unreachable, the app
   degrades to real pvlib **clear-sky physics**, not invented data.
4. **Estimates are labelled.** PV generation is `ESTIMATED_FROM_IRRADIANCE` (never "measured");
   models that aren't production-ready say so, with a reason.
5. **No rupee DSM charges** until an official KERC/CERC tariff order is connected
   (`emits_rupee_values = false`).

---

## Headline: the Substation-Driven Agent Workflow

Pick any of **344 real Bengaluru substations** (OpenStreetMap / Overpass, ODbL) from the
dropdown and it becomes the **central context object** that flows through every agent:

```
SubstationContext
  → WeatherAgent          (Open-Meteo @ the substation's own coordinates; clear-sky fallback)
  → SolarIrradianceAgent  (solar_forecast_model.pkl → GHI W/m² per hour)
  → CloudRiskAgent        (cloud_risk_classifier.pkl → P(cloud drop) per hour)
  → GenerationTimelineAgent (GHI + your plant capacity → ESTIMATED PV MW per hour)
  → DSMAgent              (deviation-breach risk + honest, framework-only DSM)
  → OrchestratorAgent     (assembles the result with agent_trace + calculation_trace)
```

Every response includes an **`agent_trace`** (what each agent did) and a **`calculation_trace`**
(the formula + provenance behind every number). Because the substation's real fields gate the
work, unavailable inputs **block** their calculations instead of faking them:

- `capacity_mva` is unavailable in OSM (0 of 344) → `capacity_status = NOT_AVAILABLE`,
  `substation_loading_percent = null`, and substation-loading DSM is blocked.
- No official tariff → DSM is framework-only, **no rupee charge**.

Full design: **[docs/SUBSTATION_DRIVEN_AGENT_WORKFLOW.md](docs/SUBSTATION_DRIVEN_AGENT_WORKFLOW.md)** ·
DSM input trace: **[docs/DSM_SUBSTATION_INPUT_TRACE.md](docs/DSM_SUBSTATION_INPUT_TRACE.md)**.

### Core formulas (project standards)

Every number on the frontend and in the API is computed by deterministic code — no LLM
performs math. The full reference with sources and provenance classification for each
formula is in **[docs/FORMULA_SOURCES.md](docs/FORMULA_SOURCES.md)**.

```
─── Solar physics (pvlib, OFFICIAL_SOURCE) ───

# Irradiance closure (verified on NSRDB Himawari 2019 Bengaluru: MAE 0.4 W/m² ≈ 0.13%)
GHI = DNI·cos(θz) + DHI          # θz = solar zenith angle from NREL SPA

# Erbs decomposition (when only GHI is available)
dni, dhi = pvlib.irradiance.erbs(ghi, zenith, datetime)

# Plane-of-array transposition
poa = pvlib.irradiance.get_total_irradiance(tilt, azimuth, zenith, azimuth_sun, dni, ghi, dhi)

# Faiman cell temperature
T_cell = pvlib.temperature.faiman(poa, temp_air, wind_speed)

# PVWatts DC power
P_dc = pvwatts_dc(poa, T_cell, P_dc0, γ_pdc)   # γ_pdc = −0.0035 /°C (crystalline Si)

# Inverter AC power (clipped to [0, capacity_mw])
P_ac = pvwatts(pdc, pdc0, eta_inv_nom=0.96)

# Confidence score
confidence = clamp(1 − 0.35·cloud_fraction, 0.4, 0.99)   # raised ≥0.9 in near-dark hours

─── DSM deviation (interval-normalised, USER_CONFIGURABLE) ───

deviation_mw      = actual_or_predicted_mw − scheduled_mw
deviation_pct     = ((|deviation_mw| / Δt_hours) × block_hours / denominator) × 100
                    # denominator = available_capacity (CERC 6(2)(a)) or scheduled (simple)
direction         = UNDER_INJECTION | OVER_INJECTION | WITHIN_LIMIT
chargeable_energy = Σ over slabs of (pct_in_slab/100 × capacity × interval_hours)
dsm_charge        = Σ chargeable_energy_slab_kWh × slab_rate

─── Dynamic risk score (FALLBACK_DEFAULT, transparent & reproducible) ───

dev_pct      = |actual_kwh − scheduled_kwh| / scheduled_kwh × 100
pv_risk      = (1 − clamp(pv_score, 0, 1)) × 100
raw_score    = 0.6 × dev_pct + 0.4 × pv_risk
risk_score   = clamp(raw_score, 0, 100)
# Example: 88 kWh actual vs 100 kWh, pv_score=0.85 → 12% dev, 15% pv-risk → score 13.2

─── Fuzzy risk (FALLBACK_DEFAULT, triangular membership functions) ───

# Combines DSM breach ratio, forecast confidence, and cloud volatility → 0-100 score
# Bands: NORMAL (≤15) / MODERATE (16-40) / HIGH (41-71) / CRITICAL (>71)
fuzzy_score = weighted_mean(breach_ratio, 1-confidence, cloud_volatility) via μ functions

─── DSM risk classification (USER_CONFIGURABLE, KERC slab rates) ───

# deviation %  → risk level   → action                  → penalty rate
# 0–5%         NORMAL          No action                 ₹0/kWh (within band)
# 5–10%        MODERATE        Monitor                   ₹2/kWh
# 10–15%       HIGH            Investigate               ₹4/kWh
# >15%         CRITICAL        Manual inspection         ₹6/kWh (100% of PP rate)

─── ML metrics (OFFICIAL_SOURCE, sklearn.metrics) ───

MAE  = (1/n) × Σ|y_true − y_pred|
RMSE = √((1/n) × Σ(y_true − y_pred)²)
MAPE = (100/n) × Σ|y_true − y_pred| / y_true
R²   = 1 − Σ(y_true − y_pred)² / Σ(y_true − ȳ)²

─── RL (REINFORCE policy gradient) ───

∇θ J(θ) = E[∇θ log π(a|s) · R(t)]
# State: [hour, GHI, temp, cloud, pv_gen]  Action: rate multiplier ∈ {0.8, 0.9, 1.0, 1.1, 1.2}
# Reward: hourly_production − penalty − consumer_discount

─── Substation reliability (MODEL_LEARNED from OSM data) ───

reliability_score = 0.6 − 0.1 × (missing field count)
# capacity_mva is 100% null in OSM → always reduces reliability; user must supply it

─── Haversine distance (substation matching) ───

d = 2·R·arcsin(√(sin²(Δφ/2) + cos(φ₁)·cos(φ₂)·sin²(Δλ/2)))   # R = 6,371 km

─── Energy & settlement ───

surplus_mw      = production_mw − load_mw
self_consumption = min(production, load) / production
net_owner_settlement = Σ hourly (penalty + bonus − consumer_discount)
```

All formulas are documented with source classification and code references in
**[docs/FORMULA_SOURCES.md](docs/FORMULA_SOURCES.md)** (13 formula sections with provenance).

### Data sources (all real, all labelled)

| Source | Role |
|---|---|
| Open-Meteo | Live hourly weather (key-less) — the only live forecast source |
| **NLR NSRDB** (ex-NREL) | Historical satellite GHI/DNI/DHI for India (suny-india 2000-14, himawari 2016-20) — training/backtesting; key via developer.nlr.gov |
| Kaggle PV / irradiance / load | ML training datasets (REAL_INDIA / REAL_BENGALURU labels) |
| OpenStreetMap Overpass | Substation locations (ODbL) |

### Try it (backend running on `:8000`)

```bash
# 1) List substations for the dropdown
curl "http://localhost:8000/api/v1/substations/catalog?limit=5"

# 2) Full context for one substation (missing fields are null, never faked)
curl "http://localhost:8000/api/v1/substations/OSM-1299917513"

# 3) Run the whole agent workflow for the selected substation
curl -X POST http://localhost:8000/api/v1/orchestrate/substation \
  -H "Content-Type: application/json" \
  -d '{"substation_id":"OSM-1299917513","site_capacity_mw":50,"scheduled_generation_mw":20,"forecast_horizon_hours":12}'

# 4) Substation-context DSM forecast (framework-only, no rupees)
curl -X POST http://localhost:8000/api/v1/dsm/forecast \
  -H "Content-Type: application/json" \
  -d '{"substation_id":"OSM-1299917513","site_capacity_mw":50,"scheduled_generation_mw":20}'

# 5) Generation timeline (allow_estimated=false shows real irradiance only)
curl "http://localhost:8000/api/v1/generation/timeline?substation_id=OSM-1299917513&site_capacity_mw=50&forecast_horizon_hours=12"
```

In the UI, the **Substation Workflow** panel appears on the **Locations** and **DSM** pages.

---

## What else it does

- **Real weather** — hourly GHI/DNI/DHI, temperature, humidity, cloud, wind, pressure from
  **Open-Meteo** (free, key-less), Redis-cached, DB-persisted.
- **ML + physics forecasting** — pvlib clear-sky physics and scikit-learn models trained on
  **real** data (see below); `formula` / `ml` / `hybrid` modes; formula fallback is reported, never faked.
- **Advanced DSM** — configurable rule profiles (region · regulator · denominator · slab bands);
  KERC/BESCOM and CERC frameworks seeded, each with a source status.
- **Fuzzy risk** — genuine fuzzy inference (LOW/MEDIUM/HIGH/CRITICAL).
- **Locations & substations** — OSM substations + operator CSV, nearest-substation mapping,
  per-site data coverage.
- **Dashboard** — real operational UI that shows a clear "Backend Offline" banner instead of faking data.

---

## Real data & trained models

Datasets are real and **geography-labelled**; nothing is trained on toy/synthetic data in real
mode. Exact metrics and provenance live in the model cards
(`backend/models/metadata/*_card.json`) — see **[docs/KAGGLE_TRAINING_RESULTS.md](docs/KAGGLE_TRAINING_RESULTS.md)**
and **[docs/REAL_DATA_PHASE1_7_BENGALURU_ML.md](docs/REAL_DATA_PHASE1_7_BENGALURU_ML.md)**.

| Model | Training data | Metric | Production-ready |
|-------|---------------|--------|------------------|
| `solar_forecast_model` (GHI) | Open-Meteo Bengaluru (`REAL_COORDINATE_BASED`) | R² 0.956 | ✅ |
| `cloud_risk_classifier` | Open-Meteo Bengaluru | F1 0.671 · ROC-AUC 0.900 | ✅ |
| `dsm_classifier` (breach risk) | Open-Meteo Bengaluru | F1 0.791 | ✅ (framework, no rupees) |
| `kaggle_solar_irradiance_bengaluru_model` | Kaggle, `REAL_BENGALURU` | R² 0.920 | ✅ |
| `kaggle_cloud_risk_bengaluru_model` | Kaggle, `REAL_BENGALURU` | F1 0.847 · ROC-AUC 0.851 | ✅ |
| `kaggle_pv_ac_model` | Kaggle India PV plant, `REAL_INDIA` | R² 0.869 | ❌ domain shift (India plant ≠ Bengaluru) |
| `kaggle_load_forecast_model` | Kaggle India demand, `REAL_INDIA` | R² 0.893 | ❌ national ≠ Bengaluru-local |
| `load_forecast_model` | `REAL_INDIA` | R² 0.883 | ❌ domain shift HIGH |
| `rl_policy` | — | — | ❌ skipped: `INSUFFICIENT_REAL_ENVIRONMENT_DATA` |

- **Substations:** 344 real Bengaluru substations from OpenStreetMap (`capacity_mva` unavailable →
  always `null`). Committed as `backend/data/ml/bengaluru_substations_cleaned.parquet`.
- **Not production truth:** PV generation is estimated from irradiance; non-local models are
  clearly marked and are for pretraining/reference only.

Retrain reproducibly (models `.pkl` are gitignored; cards are committed as provenance):
```bash
cd backend
python -m app.ml.build_kaggle_ml_datasets --data-mode real
python -m app.ml.train_from_kaggle        --data-mode real
python -m app.ml.train_all_agents --region bengaluru --data-mode real
```

---

## Quick start

### Docker (full stack)
```bash
cp .env.example .env            # sensible defaults work out of the box
docker compose up --build
```
Services: `frontend`, `backend`, `postgres`, `redis`. Current port mapping and reverse-proxy
setup are in **[docs/DOCKER_ARCHITECTURE.md](docs/DOCKER_ARCHITECTURE.md)** and
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** (AWS ECS/Terraform + single-instance).

### Local development (no Docker)
```bash
# Backend (SQLite default; no DB server needed)
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
#   Swagger UI:  http://localhost:8000/docs
#   Health:      http://localhost:8000/api/v1/health

# Frontend
cd frontend && npm install && npm run dev    # http://localhost:3000
```
Point the frontend at the API with `NEXT_PUBLIC_API_BASE_URL` (defaults to `http://localhost:8000/api/v1`).

---

## Agents

Deterministic coordinators (no LLM in the numeric path). Core platform: SourceRegistry,
KaggleData, LiveWeather, LocationData, FeatureEngineering, Forecast, DSMEngine, FuzzyRisk,
Explanation, Orchestrator, APIManagement, Persistence. Substation workflow:
**SubstationContext → Weather → SolarIrradiance → CloudRisk → GenerationTimeline → DSM →
Orchestrator** (see `SubstationOrchestrator`). Details: [docs/AGENT_WORKFLOWS.md](docs/AGENT_WORKFLOWS.md).

---

## Tests & lint

```bash
cd backend && python -m pytest tests/ -q          # 118 tests, offline (no network)
ruff check app tests && ruff format --check app tests
cd frontend && npm run build                       # type-check + build
```
The substation workflow alone is covered by `backend/tests/test_substation_workflow.py`
(15 tests: honest missing-field handling, per-coordinate weather, timeline rows carry the
`substation_id`, DSM blocking, no rupees, no synthetic in real mode, full provenance).

---

## Live demo

Verified reachable (HTTP only): **http://suryagrid.mithungowda.in/** — frontend `HTTP 200`;
`/api/v1/health` reports `database=connected (postgresql)`, `redis=connected`,
`environment=production`. (Availability may vary; run locally for a guaranteed instance.)

---

## Documentation

**Full index:** [docs/INDEX.md](docs/INDEX.md) — every document with a one-line summary and "when to read" guide.

**Start here:** [App Flow & DSM Logic](docs/APP_FLOW.md) · [System Architecture](docs/ARCHITECTURE.md) ·
[API Reference](docs/API_REFERENCE.md) (61 endpoints) · [Deployment](docs/DEPLOYMENT.md)

**Substation workflow:** [Substation-Driven Agent Workflow](docs/SUBSTATION_DRIVEN_AGENT_WORKFLOW.md) ·
[DSM Substation Input Trace](docs/DSM_SUBSTATION_INPUT_TRACE.md) ·
[Locations & Substations](docs/LOCATION_AND_SUBSTATION_DATA.md)

**Real data & ML:** [Phase 1.7 Bengaluru ML](docs/REAL_DATA_PHASE1_7_BENGALURU_ML.md) ·
[Kaggle Training Results](docs/KAGGLE_TRAINING_RESULTS.md) ·
[Kaggle Dataset Selection](docs/KAGGLE_DATASET_SEARCH_AND_SELECTION.md) ·
[ML Pipeline](docs/ML_PIPELINE.md)

**Provenance & rules:** [Source Registry](docs/SOURCE_REGISTRY.md) ·
[Formula Sources](docs/FORMULA_SOURCES.md) · [DSM Rule Sources](docs/DSM_RULE_SOURCES.md) ·
[Data Source Catalog](docs/DATA_SOURCE_CATALOG.md) · [Agent Workflows](docs/AGENT_WORKFLOWS.md)

---

## Honesty & limitations

Decision-support estimates, **not** a settlement of record. PV generation is estimated from
forecast irradiance (never metered). Substation `capacity_mva`, `district`, real load telemetry,
and official rupee DSM tariffs are **not available** and their calculations are explicitly
blocked, not fabricated. Non-local (India-wide) models are labelled and are not production truth
for Bengaluru. DSM figures depend on the live regulatory order and are marked pending until an
official KERC/CERC source is connected. Synthetic data is a labelled fallback only and is
forbidden entirely in `APP_DATA_MODE=real`.
