# SuryaGrid AI — Agent Workflows

Agents are **deterministic Python coordinators** over the data/ml/dsm layers. No
agent uses an LLM, and no agent performs numeric settlement math via a language
model — physics (pvlib), ML (scikit-learn), and DSM slabs are all plain code.

## Two workflow modes

### A. Full run (site-based)

```
Site selected
 → APIManagementAgent            (health / rate limit / retries)
 → LocationDataAgent             (data coverage + nearest substation)
 → LiveWeatherAgent              (fetch/refresh live forecast, Redis-cached)
 → FeatureEngineeringAgent       (build features)          [ML path]
 → ForecastAgent                 (formula / ml / hybrid generation)
 → DSMEngineAgent                (advanced rule-profile deviation + charge)
 → FuzzyRiskAgent                (fuzzy risk score/level)
 → ExplanationAgent              (plain-language + source citations)
 → PersistenceAgent              (save forecast + DSM result)
 → API response → Dashboard
OrchestratorAgent sequences the per-interval Forecast→DSM→Risk→Explanation step.
```

### B. Substation-driven run (selected from the 344-substation catalog)

```
SubstationContext
 → (1) SubstationContextAgent    loads the selected substation as the context object
 → (2) WeatherAgent              Open-Meteo @ the substation's OWN coordinates
 → (3) SolarIrradianceAgent      Erbs decomposition → GHI/DNI/DHI → POA transposition
 → (4) CloudRiskAgent            P(cloud drop) per hour from cloud cover + clear-sky ratio
 → (5) GenerationTimelineAgent   pvlib physics: Faiman → PVWatts DC → inverter AC → MW per hour
 → (6) DSMAgent                  interval-normalized deviation + dynamic risk score
 → (7) OrchestratorAgent         assembles context-linked result + provenance + trace
```

Each step appends to `workflow.agent_trace[]` and every computed quantity records its
formula and provenance in `workflow.calculation_trace{}`. See
**[SUBSTATION_DRIVEN_AGENT_WORKFLOW.md](SUBSTATION_DRIVEN_AGENT_WORKFLOW.md)** for the
full specification and example response.

---

## Per-agent detail

### 1. SourceRegistryAgent (`agents/source_registry_agent.py`)
- **Purpose:** serve/validate the source registry; provide citations.
- **Inputs:** source id / type filter. **Outputs:** source records, citation arrays, validation report.
- **Tables:** none (in-memory registry mirrors docs/SOURCE_REGISTRY.md).
- **Errors:** unknown id → None. **Retry:** n/a. **Tests:** `test_sources.py`.
- **Upgrade path:** back the registry with a DB table; add per-source live re-verification.

### 2. KaggleDataAgent (`agents/kaggle_data_agent.py`)
- **Purpose:** download (Kaggle API) or load a manually-placed CSV; normalize to canonical columns.
- **Inputs:** env `KAGGLE_USERNAME`/`KAGGLE_KEY` or files in `data/raw/kaggle/`.
- **Outputs:** normalized DataFrame; honest status (`loaded`, "Kaggle dataset not loaded").
- **Tables:** none (files). **Errors:** missing creds/package → structured status, no raise; missing files → `FileNotFoundError` on load.
- **Retry:** n/a. **Tests:** `test_data_sources.py`, `test_ml_pipeline.py`.
- **Upgrade path:** support multiple Kaggle datasets; incremental refresh.

### 3. LiveWeatherAgent (`agents/live_weather_agent.py`)
- **Purpose:** fetch real forecasts (Open-Meteo) for site/substation coords over a horizon; cache in Redis; report synthetic fallback.
- **Inputs:** lat/lon/timezone/horizon (15min/30min/1h/24h/7d). **Outputs:** readings + provider + mode + cached flag + horizon note.
- **Tables:** `readings` (via PersistenceAgent when a site is registered). **Cache:** Redis (1h forecast / 15m current).
- **Errors:** live failure → synthetic fallback, **reported** (`mode=synthetic`). **Retry:** cache avoids re-calls; APIManagementAgent.retry available.
- **Tests:** `test_weather.py`. **Upgrade path:** add Solcast/NASA POWER backends; minute-level nowcast.

### 4. LocationDataAgent (`agents/location_data_agent.py`)
- **Purpose:** collect/expose sites, substations, weather grid points; nearest-substation mapping; data coverage.
- **Inputs:** OSM bbox/around or CSV; site id. **Outputs:** substation records, nearest mapping, coverage flags.
- **Tables:** `substations`, `locations`, `weather_provider_locations`, `site_substation_map`.
- **Errors:** Overpass failure → RuntimeError (caller handles); no coords → skipped (never invented).
- **Retry:** APIManagementAgent.retry. **Tests:** `test_locations.py`. **Upgrade path:** official CEA/utility substation datasets; polygon coverage.

### 5. FeatureEngineeringAgent (`agents/feature_engineering_agent.py`)
- **Purpose:** build the augmented dataset and run data-quality validation.
- **Inputs:** normalized source frame + site/schedule/substation context. **Outputs:** augmented DataFrame + quality report.
- **Tables:** none (writes `data/processed/augmented_dataset.csv`). **Errors:** missing timestamp → ValueError.
- **Retry:** n/a. **Tests:** `test_ml_pipeline.py`. **Upgrade path:** lag features, rolling stats, satellite inputs.

### 6. ForecastAgent (`agents/forecast_agent.py`)
- **Purpose:** generation nowcast in formula/ml/hybrid/auto modes.
- **Inputs:** SiteConfig + weather points + mode + predictor. **Outputs:** ForecastPoint(s) with forecast_mode, model_version, confidence, source_used.
- **Tables:** none directly. **Errors:** empty weather → []; ml unavailable → formula fallback (reported).
- **Retry:** n/a. **Tests:** `test_forecast_agent.py`, `test_erbs_fallback.py`, `test_ml_pipeline.py`.
- **Upgrade path:** probabilistic/quantile forecasts; per-site model selection.

### 7. DSMEngineAgent (`agents/dsm_engine_agent.py`)
- **Purpose:** resolve a rule profile and evaluate deviation + charge; persist results.
- **Inputs:** scheduled/predicted/actual MW, capacity, profile id/region/regulator. **Outputs:** deviation %, direction, band, penalty_status, charge, rule_source.
- **Tables:** `dsm_rule_profiles`, `dsm_rule_bands`, `dsm_results`.
- **Errors:** zero/negative denominator → `INVALID_SCHEDULE` (no divide-by-zero). **Retry:** n/a.
- **Tests:** `test_dsm_engine.py`, `test_dsm_classifier.py`. **Upgrade path:** live metered actuals; time-of-day rate variants.

### 8. FuzzyRiskAgent (`agents/fuzzy_risk_agent.py`)
- **Purpose:** fuzzy 0–100 risk score/level from DSM breach + forecast confidence + weather volatility.
- **Inputs:** deviation %, tolerance, confidence, cloud. **Outputs:** fuzzy_risk_score, fuzzy_risk_level, memberships.
- **Tables:** none. **Errors:** none (bounded). **Retry:** n/a. **Tests:** `test_fuzzy_risk.py`.
- **Upgrade path:** learn membership functions from outcome data.

### 9. ExplanationAgent (`agents/explanation_agent.py`)
- **Purpose:** plain-language interval summary; the full response attaches `sources[]`.
- **Inputs:** forecast/DSM/risk fields. **Outputs:** explanation string. **Tables:** none.
- **Errors:** none. **Retry:** n/a. **Tests:** covered via `test_orchestrator.py`.
- **Upgrade path:** optional LLM narration (kept out of the numeric path).

### 10. OrchestratorAgent (`agents/orchestrator_agent.py`)
- **Purpose:** sequence Forecast→DSM→Risk→Explanation for one interval.
- **Inputs:** forecast point + schedule + thresholds. **Outputs:** combined interval dict.
- **Tables:** none. **Errors:** propagates. **Retry:** n/a. **Tests:** `test_orchestrator.py`, `test_full_system.py`.
- **Upgrade path:** pluggable risk/DSM strategies.

### 11. APIManagementAgent (`agents/api_management_agent.py`)
- **Purpose:** system health, provider status, rate limiting, and async retries.
- **Inputs:** none / rate-limit key. **Outputs:** system status, provider status, retry wrapper.
- **Tables:** reads counts. **Errors:** degrades gracefully (Redis/DB down → "disconnected").
- **Retry:** exponential backoff (`retry`). **Tests:** `test_system.py`. **Upgrade path:** per-provider circuit breakers.

### 12. PersistenceAgent (`agents/persistence_agent.py`)
- **Purpose:** ensure readings/forecasts/DSM results are saved for registered sites.
- **Inputs:** site uuid + records. **Outputs:** row counts. **Tables:** `readings`, `forecasts`, `dsm_results`.
- **Errors:** ad-hoc site (uuid None) → skip; logs and continues on error. **Retry:** n/a. **Tests:** `test_api.py`, `test_full_system.py`.
- **Upgrade path:** batch/async write-behind; audit log entries.
