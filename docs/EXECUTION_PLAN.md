# SuryaGrid AI — Execution Plan & Implementation Roadmap

**Date:** 9 July 2026  
**Scope:** Complete real-agent implementation from current prototype to production-ready platform  
**Reference:** `docs/report/suryagrid_current_implementation_report.tex` (Table 10)  
**Baseline:** 54 endpoints, 93 tests passing, 3 production-ready models (irradiance/cloud/DSM-band)

---

## Executive Summary

This plan takes SuryaGrid from "architecturally complete, partially data-complete prototype" to a **production-ready real-data platform with real AI agents** across 4 phases over ~10 weeks. 

**Three major upgrades:**
1. **Real AI agents** (LLM-powered via OpenRouter) for orchestration, explanation, and anomaly detection — while the numeric ML path stays deterministic and honest
2. **Real KERC 2026 DSM charges** — the regulation now has concrete slab rates, unblocking INR output for the first time
3. **Real plant data** — approach KPCL/BESCOM for actual PV generation data last (longest lead, highest value)

### Key Constraints
- KPTCL-SLDC has **no public API** — load data requires Grid India XLS scraping
- Local PV generation has **no open data source** — requires KPCL/BESCOM plant visit (Phase 3)
- Karnataka HC has **stayed CERC's higher penalties** — use KERC 2026 regulation instead
- NASA POWER API is **key-less and fully documented** — straightforward integration
- **LLM access via OpenRouter** — single API key, model-switching without code changes

---

## Dependency Graph

```
INDEPENDENT (no blockers):
  [5] NASA POWER live provider
  [6] APP_DATA_MODE enforcement
  [7] Docker full-stack verification
  [10] Unify registries

NEWLY UNBLOCKED:
  [2] KERC tariff parser ← KERC DSM Regulation 2026 (July) now has exact slab rates

EXTERNAL DATA DEPENDENT:
  [1] Grid India/SLDC load ingestion ← XLS scraping from npp.gov.in
  [4] Substation capacity ← IndiaAI/aikosh KPTCL dataset (needs inspection)
  [3] Local PV generation ← KPCL/BESCOM (partnership required, longest lead)

BLOCKED UNTIL DATA ARRIVES:
  [8] Retrain load model ← depends on [1]
  [9] RL environment ← depends on [1] + [2] + [3]
```

```
Phase 0 (Week 1)        Phase 1 (Week 2-3)       Phase 1.5 (Week 3-4)     Phase 2 (Week 5-6)       Phase 3 (Week 7-10)
┌─────────────────┐    ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ [6] DATA_MODE   │    │ [5] NASA POWER   │     │ AI Orchestrator  │     │ [1] Grid India   │     │ [8] Retrain load │
│ [10] Registries │    │ [2] KERC parser  │     │ AI Explanation   │     │ [4] Substation   │     │ [9] RL environ.  │
│ [7] Docker      │    │                  │     │ AI Anomaly Det.  │     │ [3] PV (begin)   │     │ [3] Plant visit  │
└─────────────────┘    └──────────────────┘     │ (OpenRouter/LLM) │     └──────────────────┘     └──────────────────┘
     CODE-ONLY              API + REGULATION     └──────────────────┘          DATA ACQUIRE          ML + PLANT APPROACH
                                                      REAL AI AGENTS
```

---

## Phase 0 — Foundation Hardening (Week 1)

**Goal:** Clean up technical debt so all subsequent work builds on solid ground.  
**Effort:** ~5-7 days | **Blockers:** None (all code-only)  
**Parallelizable:** Yes — all 3 items are independent.

### 0.1 — Strict Global APP_DATA_MODE Enforcement

**Current state:** `APP_DATA_MODE=real` is enforced in ML scripts but legacy prediction routes still have synthetic weather fallback.

**Tasks:**
1. Audit all routes in `app/api/routes_*.py` for synthetic/demo data paths
2. Add middleware or decorator that checks `APP_DATA_MODE` before any data response
3. Ensure `SyntheticWeatherProvider` raises `SyntheticFallbackError` when mode=real (already done in ML, extend to API layer)
4. Add test: hit every endpoint with `APP_DATA_MODE=real` and assert no synthetic labels in response
5. Document which routes degrade gracefully (clear-sky physics) vs which return 503

**Deliverables:**
- [ ] `app/core/data_mode_guard.py` — middleware/decorator
- [ ] Updated tests in `tests/test_app_config.py`
- [ ] `docs/APP_DATA_MODE_ENFORCEMENT.md` — route-by-route behavior matrix

**Effort:** 2-3 days

### 0.2 — Unify Phase 1.5 Registry + Phase 1.7 Provenance

**Current state:** Two parallel source-tracking systems: `source_registry.py` (8 static records) and `provenance.py` (label system in model cards).

**Tasks:**
1. Design unified `SourceRecord` schema merging registry fields + provenance labels
2. Migrate `source_registry.py` records into the new schema
3. Ensure model cards reference the same source IDs
4. Single `/api/v1/sources` endpoint returns both static registrations and dynamic provenance
5. Deprecate old dual-path queries

**Deliverables:**
- [ ] `app/data_sources/unified_registry.py`
- [ ] Migration script for existing model cards
- [ ] Updated `/sources` API with combined output
- [ ] Tests asserting no orphan source references

**Effort:** 2-3 days

### 0.3 — Docker Full-Stack Verification

**Current state:** `docker-compose.yml` exists with 4 services + healthchecks, but was never executed/verified.

**Tasks:**
1. Install Docker Desktop / ensure `docker compose` plugin works
2. Run `docker compose up --build` and capture logs
3. Verify all 4 healthchecks pass (postgres, redis, backend, frontend)
4. Run `pytest` inside the backend container
5. Hit `/api/v1/health` and verify `database=connected (postgresql)`, `redis=connected`
6. Fix any issues (common: DB migration, env vars, CORS)
7. Document the verified configuration

**Deliverables:**
- [ ] Passing `docker compose up` with all healthchecks green
- [ ] `docs/DOCKER_VERIFICATION_LOG.md` — captured evidence
- [ ] Any fixes to Dockerfiles/compose committed

**Effort:** 1-2 days



---

## Phase 1 — API & Regulation Integration (Weeks 2-3)

**Goal:** Wire NASA POWER as a live provider and implement the KERC DSM 2026 tariff parser — the first time SuryaGrid can emit real INR charges.  
**Effort:** ~8-10 days | **Blockers:** None (KERC regulation is now public and concrete)  
**Parallelizable:** Yes — NASA POWER and KERC parser are independent.

### 1.1 — NASA POWER Live Weather Provider

**Current state:** API probed at build-time (r=0.87 vs Open-Meteo), but only used for cross-validation. Not wired as a runtime provider.

**Why it matters:** Second real-time weather source = redundancy. If Open-Meteo is down, NASA POWER provides degraded-but-real GHI instead of clear-sky-only fallback.

**API Details (confirmed):**
- Endpoint: `https://power.larc.nasa.gov/api/temporal/hourly/point`
- Auth: None (key-less)
- Max params per hourly query: 15
- Key param: `ALLSKY_SFC_SW_DWN` (GHI), plus T2M, RH2M, WS10M, PS
- Coverage: hourly since 2001, ~0.5° grid
- Time base: UTC or LST (configurable)

**Tasks:**
1. Create `app/providers/nasa_power.py` implementing `WeatherProvider` ABC
2. Map NASA POWER params → `WeatherPoint` dataclass fields
3. Handle LST→IST timezone conversion (NASA returns LST by default)
4. Add Redis caching (same pattern as Open-Meteo)
5. Register in `source_registry` as `SRC-NASA-POWER-001`
6. Add provider selection logic: primary=Open-Meteo, fallback=NASA-POWER
7. Add integration test (mock HTTP, verify WeatherPoint output)
8. Cross-validate: compare live NASA vs Open-Meteo for same coords, log drift

**Implementation Pattern** (follows existing `providers/open_meteo.py`):
```python
# app/providers/nasa_power.py
class NASAPowerProvider(WeatherProvider):
    name = "nasa-power"
    
    async def fetch_forecast(self, latitude, longitude, timezone, forecast_days=1, past_days=0):
        # NASA POWER doesn't do "forecast" — it's reanalysis/near-real-time
        # Use for historical fill and as a fallback, not primary forecast
        ...
```

**Deliverables:**
- [ ] `app/providers/nasa_power.py` — full implementation
- [ ] Updated `app/data_sources/source_registry.py` with live status
- [ ] `tests/test_nasa_power_provider.py` — unit + integration
- [ ] Config: `WEATHER_FALLBACK_PROVIDER=nasa-power` in settings
- [ ] Updated `docs/DATA_SOURCE_CATALOG.md`

**Effort:** 2-3 days

### 1.2 — KERC DSM 2026 Tariff Parser (REAL INR CHARGES)

**Current state:** DSM engine produces band/risk only. `emits_rupee_values=false`. KERC rates were "market-linked" and unparseable — **UNTIL NOW.**

**BREAKTHROUGH:** The KERC (Forecasting, Scheduling, Deviation Settlement Mechanism) Regulations, 2026 were published in July 2026 with **concrete, fixed slab rates**:

| Deviation Band (% of scheduled) | Charge (Solar) |
|---|---|
| ≤ ±5% | **Nil** (tolerance band) |
| > 5% to ≤ 15% | Rs. 0.25/unit |
| > 15% to ≤ 25% | Rs. 0.50/unit |
| > 25% | Rs. 0.75/unit |

**Additional rules:**
- Denominator: **Scheduled Generation** (not available capacity)
- Annual cap: **3 paise/unit** × total annual generation
- Applicability: Solar ≥ 5 MW at pooling station
- Zero-schedule gaming: deemed 1 MW schedule applied
- Tolerance tightened from ±10% to **±5%** (major change from 2015 regulation)

**Legal note:** Karnataka HC has stayed *CERC's* higher penalties for RE, but KERC's *own* 2026 regulation is a separate, currently enforceable state-level order. We implement KERC 2026.

**Tasks:**
1. Create `app/dsm/kerc_dsm_2026.py` with the exact slab structure
2. Update `RuleProfile` model to support:
   - Slab-based cumulative charges (not just flat rate)
   - Annual cap enforcement (3 paise/unit)
   - Zero-schedule deemed-1-MW rule
3. Update `karnataka_dsm.py` integration to use new slabs
4. Set `emits_rupee_values=true` for KERC 2026 profile only
5. Add source provenance: regulation title, gazette date, section references
6. Create tests with known deviation scenarios and expected INR outputs
7. Update frontend DSM page to show real charges (with "KERC 2026" badge)
8. Update model card / DSM card metadata

**Deliverables:**
- [ ] `app/dsm/kerc_dsm_2026.py` — regulation implementation
- [ ] Updated `app/dsm/configurable_rules.py` with KERC-2026 profile
- [ ] `tests/test_kerc_dsm_2026.py` — scenario-based validation
- [ ] Frontend: DSM page shows INR charges with source attribution
- [ ] `docs/DSM_RULE_SOURCES.md` updated with KERC 2026 citation
- [ ] Source status changed: `NEEDS_OFFICIAL_SOURCE` → `REAL_KARNATAKA`

**Effort:** 3-5 days

**Sample implementation:**
```python
# app/dsm/kerc_dsm_2026.py
KERC_2026_SOLAR_SLABS = [
    # (min_deviation_pct, max_deviation_pct, rate_inr_per_kwh)
    (5.0, 15.0, 0.25),
    (15.0, 25.0, 0.50),
    (25.0, 100.0, 0.75),
]
KERC_2026_TOLERANCE_PERCENT = 5.0
KERC_2026_ANNUAL_CAP_PAISE_PER_UNIT = 3.0
KERC_2026_DENOMINATOR = "scheduled_generation"
```



---

## Phase 1.5 — Real AI Agent Layer (Week 3-4)

**Goal:** Replace the deterministic Python coordinators with **real LLM-powered AI agents** that reason, explain, detect anomalies, and make intelligent orchestration decisions — while the numeric/ML math path remains untouched and honest.  
**Effort:** ~8-12 days | **Blockers:** None (code-only, uses existing data)  
**Framework:** LangGraph (production-grade state machines, checkpointing, tool-use)

### Architecture: Dual-Layer Agent Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AI REASONING LAYER (LLM-powered)                  │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │ Orchestrator │  │ Explanation  │  │  Anomaly     │             │
│  │ Agent (LLM)  │  │ Agent (LLM)  │  │  Detective   │             │
│  │              │  │              │  │  Agent (LLM) │             │
│  │ - decides    │  │ - generates  │  │              │             │
│  │   workflow   │  │   natural    │  │ - spots odd  │             │
│  │   order      │  │   language   │  │   patterns   │             │
│  │ - handles    │  │   insights   │  │ - flags data │             │
│  │   edge cases │  │ - actionable │  │   quality    │             │
│  │ - validates  │  │   recs       │  │   issues     │             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
│         │                  │                  │                     │
├─────────┼──────────────────┼──────────────────┼─────────────────────┤
│         ▼                  ▼                  ▼                     │
│              NUMERIC/ML LAYER (deterministic, untouched)             │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │ Weather      │  │ Solar/Cloud  │  │ DSM Engine   │             │
│  │ Provider     │  │ ML Models    │  │ (KERC rules) │             │
│  │ (Open-Meteo) │  │ (.pkl files) │  │              │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│                                                                     │
│  RULE: LLM NEVER touches numbers. It reads results and reasons.    │
└─────────────────────────────────────────────────────────────────────┘
```

**Core principle:** The LLM layer **consumes** outputs from the numeric layer and adds intelligence (reasoning, anomaly detection, recommendations, natural language). It does NOT generate forecasts, modify model outputs, or fabricate data.

### 1.5.1 — Framework Setup & Agent Infrastructure

**Recommended:** LangGraph (production default for stateful agent workflows in 2026)

**Why LangGraph over CrewAI:**
- State-machine control flow matches the existing sequential pipeline
- Checkpointing for long-running workflows
- Tool-use pattern maps directly to existing `agent_models.predict_*` calls
- Better debugging/observability for production
- Existing FastAPI integration

**LLM Provider: OpenRouter**

OpenRouter (`openrouter.ai`) is the unified gateway — single API key, access to all models (GPT-4o, Claude, Llama, Mistral, Gemini). This avoids vendor lock-in and lets you switch models per agent based on cost/quality:

| Agent | Recommended Model | Why |
|-------|-------------------|-----|
| Orchestrator | `anthropic/claude-sonnet-4-20250514` | Best reasoning + tool-use |
| Explanation | `openai/gpt-4o` | Best natural language generation |
| Anomaly Detective | `mistralai/mistral-large` | Fast, good pattern recognition, cheaper |
| Fallback | `meta-llama/llama-3.1-70b` | Free tier / self-hosted option |

**Config:**
```python
# .env
OPENROUTER_API_KEY=sk-or-v1-xxxxx
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL_ORCHESTRATOR=anthropic/claude-sonnet-4-20250514
LLM_MODEL_EXPLANATION=openai/gpt-4o
LLM_MODEL_ANOMALY=mistralai/mistral-large-latest
```

**Tasks:**
1. Add dependencies: `langgraph`, `langchain-core`, `langchain-openai` (OpenRouter is OpenAI-compatible)
2. Create `app/agents/ai/` package for LLM-powered agents
3. Design agent state schema (extends existing `SubstationContext`)
4. Create tool wrappers for existing numeric functions:
   - `tool_predict_solar(weather_inputs)` → wraps `agent_models.predict_solar`
   - `tool_predict_cloud(weather_inputs)` → wraps `agent_models.predict_cloud`
   - `tool_dsm_assess(deviation)` → wraps DSM engine
   - `tool_fetch_weather(lat, lon)` → wraps weather provider
   - `tool_get_substation(id)` → wraps substation provider
5. Configure OpenRouter via `langchain-openai` (OpenAI-compatible endpoint):
   ```python
   from langchain_openai import ChatOpenAI
   
   llm = ChatOpenAI(
       model="anthropic/claude-sonnet-4-20250514",
       openai_api_key=settings.OPENROUTER_API_KEY,
       openai_api_base="https://openrouter.ai/api/v1",
       default_headers={"HTTP-Referer": "https://suryagrid.mithungowda.in"},
   )
   ```
6. Add `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, per-agent model config to settings
7. Support model switching via env var (no code change needed to swap models)

**Deliverables:**
- [ ] `app/agents/ai/__init__.py`
- [ ] `app/agents/ai/tools.py` — numeric layer tool wrappers
- [ ] `app/agents/ai/state.py` — LangGraph state schema
- [ ] `app/agents/ai/config.py` — LLM provider configuration
- [ ] Updated `requirements.txt` with LangGraph + LangChain deps
- [ ] Tests: tools return correct outputs when called by agent

**Effort:** 2-3 days

### 1.5.2 — AI Orchestrator Agent

**Current:** `SubstationOrchestrator` is a hardcoded sequential pipeline (steps 1→2→3→4→5→6→7). No decision-making — same steps every time regardless of context.

**New:** An LLM-powered orchestrator that:
- **Decides workflow dynamically** based on context (e.g., skip cloud risk at night, prioritize DSM when deviation is high)
- **Handles edge cases intelligently** (missing data, provider failures, unusual patterns)
- **Validates intermediate results** before passing them downstream
- **Provides reasoning** for why each step was taken

```python
# app/agents/ai/orchestrator.py
from langgraph.graph import StateGraph, END

class AIOrchestrator:
    """LLM-powered orchestrator that reasons about the workflow."""
    
    def build_graph(self):
        graph = StateGraph(SubstationWorkflowState)
        
        graph.add_node("analyze_context", self.analyze_context)
        graph.add_node("fetch_weather", self.fetch_weather)
        graph.add_node("predict_solar", self.predict_solar)
        graph.add_node("assess_risk", self.assess_risk)
        graph.add_node("dsm_analysis", self.dsm_analysis)
        graph.add_node("synthesize", self.synthesize_insights)
        
        # LLM decides routing based on context
        graph.add_conditional_edges("analyze_context", self.route_decision)
        ...
        return graph.compile()
```

**Tasks:**
1. Define `SubstationWorkflowState` (TypedDict with all intermediate results)
2. Implement node functions that call numeric tools and store results in state
3. Implement routing logic: LLM decides next step based on current state
4. Add human-readable reasoning to `agent_trace` (LLM explains each decision)
5. Preserve backward compatibility: existing API returns same schema
6. Add `/api/v1/orchestrate/substation/ai` endpoint (new, alongside existing)
7. Graceful fallback: if LLM is unavailable, fall back to deterministic pipeline

**Deliverables:**
- [ ] `app/agents/ai/orchestrator.py` — LangGraph-based orchestrator
- [ ] `app/api/routes_ai_orchestrate.py` — new AI endpoint
- [ ] Tests: same inputs → same numeric outputs (LLM adds reasoning, doesn't change numbers)
- [ ] Fallback test: LLM down → deterministic pipeline still works

**Effort:** 3-4 days

### 1.5.3 — AI Explanation Agent

**Current:** `explanation_agent.py` generates rule-based text ("Your deviation is X% which exceeds the Y% threshold..."). Mechanical, not insightful.

**New:** LLM-powered natural language explanations that:
- Provide **actionable recommendations** ("Reduce scheduled generation by 3 MW for next 2 hours to stay within band")
- Explain **why** in plain language ("Cloud cover is increasing from 20% to 65% between 2-4 PM, which will drop your actual generation below schedule")
- Contextualize for the **specific substation** ("This substation is in a high-irradiance zone, so the cloud impact will be more pronounced")
- Generate **executive summaries** for non-technical stakeholders

**Tasks:**
1. Create `app/agents/ai/explanation.py` with LLM-powered explainer
2. Prompt template includes: numeric results, substation context, weather trend, DSM rules
3. Output: structured JSON with `summary`, `recommendations`, `risk_narrative`, `confidence_note`
4. Rate-limit LLM calls (cache explanations for same numeric outputs)
5. Add to orchestrator pipeline as final synthesis step
6. Frontend: render AI explanation in a dedicated panel

**Deliverables:**
- [ ] `app/agents/ai/explanation.py`
- [ ] Prompt templates in `app/agents/ai/prompts/`
- [ ] Frontend: `AIInsightsPanel.tsx` component
- [ ] Caching layer for explanation deduplication

**Effort:** 2-3 days

### 1.5.4 — AI Anomaly Detective Agent

**Current:** No anomaly detection. If data looks weird, nobody notices.

**New:** An always-on agent that:
- Monitors incoming weather data for **unusual patterns** (GHI spike at night, impossible humidity, sudden drops)
- Detects **model-vs-actual drift** (if actual generation data arrives later)
- Flags **substation context inconsistencies** (coordinates outside Karnataka, duplicate IDs)
- Generates **data quality alerts** with severity levels

**Tasks:**
1. Create `app/agents/ai/anomaly_detective.py`
2. Define anomaly types: weather_impossible, model_drift, data_gap, coordinate_outlier
3. LLM analyzes patterns and provides human-readable alerts
4. Store alerts in DB with timestamps and resolution status
5. Add `/api/v1/alerts` endpoint
6. Frontend: alert banner on dashboard

**Deliverables:**
- [ ] `app/agents/ai/anomaly_detective.py`
- [ ] `app/db/models.py` — AlertRecord model
- [ ] `app/api/routes_alerts.py`
- [ ] Frontend: alert system
- [ ] Scheduler: runs anomaly check every hour

**Effort:** 2-3 days

### 1.5.5 — Agent Communication Protocol

**How agents talk to each other:**

```
┌────────────────┐         ┌────────────────┐         ┌────────────────┐
│  Orchestrator  │──state──▶│  Solar Agent   │──state──▶│  DSM Agent     │
│  (LLM decides) │◀─result─│  (ML numeric)  │◀─result─│  (KERC rules)  │
└────────────────┘         └────────────────┘         └────────────────┘
        │                                                       │
        ▼                                                       ▼
┌────────────────┐                                    ┌────────────────┐
│  Anomaly Det.  │                                    │  Explanation   │
│  (LLM reviews) │                                    │  (LLM writes)  │
└────────────────┘                                    └────────────────┘
```

- **State passing:** LangGraph shared state (TypedDict) — all agents read/write to same state
- **Tool calls:** LLM agents invoke numeric tools via LangChain tool interface
- **Traces:** Every agent appends to `agent_trace` list (preserved from current design)
- **Errors:** LLM agents can decide to retry, skip, or escalate based on error type

---

## Phase 2 — Data Acquisition & Enrichment (Weeks 5-6)

**Goal:** Bring in real Karnataka/Southern Region load data, enrich substations with capacity, and begin PV generation data sourcing.  
**Effort:** ~10-14 days | **Blockers:** External data format + access  
**Parallelizable:** Partially — load ingestion and substation enrichment are independent.

### 2.1 — Grid India / NPP Load Data Ingestion

**Current state:** Only India-national Kaggle load data (11,664 rows). Load model marked "domain shift HIGH" and not production-ready.

**Data source (confirmed):** National Power Portal (`npp.gov.in/publishedReports`) publishes daily reports as XLS (16KB each). Southern Region demand data is included. Reports are cumulative daily, available historically.

**Strategy:** Download Southern Region XLS reports → parse → extract Karnataka demand → build time-series → ingest into pipeline.

**Tasks:**
1. Write `app/data_pipeline/ingest_grid_india.py`:
   - HTTP fetcher for NPP XLS reports (daily URL pattern)
   - XLS parser (openpyxl — already in requirements)
   - Extract "Southern Region" rows, filter Karnataka where available
   - Normalize to hourly granularity (may need interpolation from daily/block)
2. Build historical backfill: scrape 1-2 years of reports
3. Quality validation: cross-check against existing Kaggle India totals
4. Store as `backend/data/ml/karnataka_load_history.parquet`
5. Label as `REAL_INDIA_SOUTHERN_REGION` (more local than national, less than state)
6. Register source with `npp.gov.in` URL and access date
7. Schedule: daily auto-fetch via APScheduler (already in codebase)

**Risks:**
- XLS format may change without notice (version headers)
- Southern Region ≠ Karnataka alone (still a proxy, but much better than national)
- Website occasionally unreachable (queue/retry logic needed)

**Deliverables:**
- [ ] `app/data_pipeline/ingest_grid_india.py` — scraper + parser
- [ ] `backend/data/ml/southern_region_load_history.parquet`
- [ ] Quality report: row count, coverage dates, gaps
- [ ] Scheduler job for daily fetch
- [ ] Tests with sample XLS fixture
- [ ] Updated provenance: `REAL_INDIA` → `REAL_INDIA_SOUTHERN_REGION`

**Effort:** 5-7 days

### 2.2 — Substation Capacity Enrichment (IndiaAI/Aikosh)

**Current state:** 344 substations from OSM with 0% capacity data. All capacity fields are `null`.

**Data source (confirmed):** IndiaAI Aikosh dataset "KPTCL Progress of Augmentation of Stations" — JSON files by Hobli, last updated Feb 2025, monthly granularity. License: Open Government License, India.

**Tasks:**
1. Download dataset from `aikosh.indiaai.gov.in` (registration may be required)
2. Inspect JSON structure — identify capacity/MVA/voltage fields
3. Build `app/data_pipeline/enrich_substations_aikosh.py`:
   - Parse KPTCL augmentation JSONs
   - Match KPTCL stations → existing OSM substations (name/location fuzzy match)
   - Enrich parquet with `capacity_mva` where matched
4. Handle partial matches: only update where confidence > threshold
5. Record match metadata: `capacity_source=KPTCL_AIKOSH`, `match_confidence`
6. Re-run substation feature pipeline with enriched data
7. Update status from `NOT_AVAILABLE` → `REAL_KARNATAKA` for matched substations

**Risks:**
- Dataset may contain "progress" data (planned augmentation) not current capacity
- Hobli-level granularity may not map cleanly to Bengaluru-area substations
- Name matching between KPTCL naming and OSM naming is imperfect

**Deliverables:**
- [ ] `app/data_pipeline/enrich_substations_aikosh.py`
- [ ] Updated `bengaluru_substations_cleaned.parquet` with capacity column
- [ ] Match quality report: % matched, confidence distribution
- [ ] Tests for enrichment logic
- [ ] `docs/SUBSTATION_ENRICHMENT_REPORT.md`

**Effort:** 3-5 days

### 2.3 — Local PV Generation Data Sourcing (Begin)

**Current state:** No local PV generation data exists. PV output is an explicit estimate from irradiance + user capacity. This is the hardest data gap.

**Potential sources identified:**
1. **KPCL solar plants** — 4 operational plants in Karnataka with published generation data (per ResearchGate paper). Contact: Karnataka Power Corporation Limited.
2. **BESCOM SRTPV portal** (`srtpv.bescom.org`) — manages rooftop solar registrations and net metering. May have aggregate generation statistics.
3. **CEA monthly generation reports** — state-wise RE generation (monthly granularity, too coarse for hourly ML but useful for validation).
4. **Individual plant operators** — data sharing agreements with commercial solar farms near Bengaluru.

**Strategy for Phase 2:** Research and initiate contact. Actual data may not arrive until Phase 3.

**Tasks:**
1. Draft formal data request letter to KPCL (via DBIT institutional channel)
2. Explore BESCOM SRTPV portal for any downloadable aggregate data
3. Check CEA monthly RE generation reports for Karnataka solar totals
4. Identify nearest commercial solar plants (10-50 MW range) for partnership
5. Design the ingestion schema (`plant_id`, `timestamp`, `ac_power_kw`, `irradiance_w_m2`, `inverter_efficiency`)
6. Create stub ingestion pipeline ready for when data arrives

**Deliverables:**
- [ ] Data request letters drafted
- [ ] `app/data_pipeline/ingest_local_pv.py` — stub with schema + validation ready
- [ ] Survey document: available sources, contact status, expected timeline
- [ ] Schema design for PV generation time-series

**Effort:** 3-4 days (research + stub; actual data arrival is external dependency)



---

## Phase 3 — ML Rebuild & Real Agent Activation (Weeks 6-8)

**Goal:** Retrain models on local data, activate RL environment, and promote agents from "partial" to "complete" status.  
**Effort:** ~10-14 days | **Blockers:** Depends on Phase 2 data arriving  
**Parallelizable:** Load retrain and RL are sequential; can overlap with PV work.

### 3.1 — Retrain Load Forecast Model on Regional Data

**Current state:** `load_forecast_model.pkl` trained on India-national data (R²=0.88, RMSE=6259 MW). Marked `production_ready=false`, `domain_shift=HIGH`.

**Prerequisite:** Phase 2.1 (Southern Region load data) complete.

**Tasks:**
1. Build new training dataset from Southern Region load + weather features
2. Engineer features: hour, day-of-week, month, temperature, holiday flag (Karnataka), monsoon/summer/winter season
3. Train new model: `southern_region_load_model.pkl`
4. Chronological 80/20 split, evaluate on held-out period
5. Compare metrics vs India-national model (expect significant improvement)
6. Generate model card with `REAL_INDIA_SOUTHERN_REGION` label
7. Update `agent_models.py` to use new model when region=karnataka
8. Set `production_ready=true` if R² > 0.90 on held-out data
9. If Southern Region data proves insufficient, keep as `PARTIAL` and document gap

**Deliverables:**
- [ ] `backend/models/trained/southern_region_load_model.pkl`
- [ ] `backend/models/metadata/southern_region_load_model_card.json`
- [ ] Updated `app/ml/train_load_agent.py` with Southern Region pipeline
- [ ] Comparison report: national vs regional model metrics
- [ ] Production-readiness decision documented

**Effort:** 2-3 days (once data is available)

### 3.2 — RL Environment Activation

**Current state:** RL scaffold exists (`app/rl/`): environment, policy, training loop. But `rl_policy.zip` is absent. Card says `INSUFFICIENT_REAL_ENVIRONMENT_DATA`.

**Prerequisites:** 
- Phase 2.1: Real load data (for demand state)
- Phase 1.2: Real tariff data (for reward function) 
- Phase 2.3: Real PV data (for generation state) — partial OK

**Tasks:**
1. Update `app/rl/real_environment.py` with:
   - State: real irradiance forecast + regional load + current deviation
   - Action: schedule adjustment (±MW from forecast)
   - Reward: negative DSM charge (from KERC 2026 slabs) + deviation minimization
2. Build environment dataset from historical data (irradiance + load + DSM scenarios)
3. Train policy using Gymnasium framework (already in requirements)
4. Evaluate: does the policy reduce average deviation vs naive scheduling?
5. If PV data still unavailable: use irradiance-estimated PV as proxy (label as such)
6. Generate model card with honest assessment of data sources used

**Decision gate:** If real local PV data is not available by Week 7, train RL on estimated-PV + real-irradiance and label as `ESTIMATED_ENVIRONMENT`. Only mark production-ready when real PV data validates the estimates.

**Deliverables:**
- [ ] Updated `app/rl/real_environment.py` — real reward function (KERC 2026)
- [ ] `backend/models/trained/rl_policy.zip` — trained policy
- [ ] `backend/models/metadata/rl_policy_card.json` — honest provenance
- [ ] Evaluation report: policy vs naive baseline
- [ ] `production_ready` decision with justification

**Effort:** 5-7 days

### 3.3 — Full Agent Status Promotion

**Current state:** Many agents are "PARTIAL" or "BLOCKED". After Phases 0-3, promote where possible.

**Status changes expected:**

| Agent | Current | After Plan | Condition |
|---|---|---|---|
| Weather | COMPLETE | COMPLETE | + NASA POWER fallback |
| Solar forecast | PARTIAL | COMPLETE | already prod-ready; add NASA POWER input |
| Cloud risk | PARTIAL | COMPLETE | add dedicated `cloud_agent.py` class file |
| Location/substation | PARTIAL | COMPLETE | capacity enriched from KPTCL |
| DSM | PARTIAL | **COMPLETE** | KERC 2026 real INR charges |
| Load forecast | BLOCKED | PARTIAL→COMPLETE | depends on regional data quality |
| RL/reward | BLOCKED | PARTIAL→COMPLETE | depends on all data arriving |
| Kaggle data | PARTIAL | COMPLETE | pipeline verified end-to-end |

**Tasks:**
1. Create dedicated `app/agents/cloud_agent.py` (currently only in agent_models)
2. Update `SubstationOrchestrator` to use enriched substation context
3. Update agent status reporting in `/agents/status` endpoint
4. Run full integration test suite with new data
5. Update documentation status tables

**Effort:** 2-3 days



---

## Timeline Summary (Gantt-style)

```
Week 1   │ Week 2   │ Week 3   │ Week 4   │ Week 5   │ Week 6   │ Week 7   │ Week 8   │ Week 9-10
─────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────
░░░░░░░░░│          │          │          │          │          │          │          │
[0.1] APP_DATA_MODE enforcement (2-3d)
░░░░░░░░░│          │          │          │          │          │          │          │
[0.2] Unify registries (2-3d)
░░░░░░░░░│          │          │          │          │          │          │          │
[0.3] Docker verification (1-2d)
         │░░░░░░░░░░│          │          │          │          │          │          │
         [1.1] NASA POWER provider (2-3d)
         │░░░░░░░░░░│░░░░░░░░░░│          │          │          │          │          │
         [1.2] KERC DSM 2026 parser (3-5d)
         │          │░░░░░░░░░░│░░░░░░░░░░│          │          │          │          │
                    [1.5.1] AI Agent infra + OpenRouter (2-3d)
         │          │░░░░░░░░░░│░░░░░░░░░░│          │          │          │          │
                    [1.5.2] AI Orchestrator (3-4d)
         │          │          │░░░░░░░░░░│          │          │          │          │
                              [1.5.3] AI Explanation agent (2-3d)
         │          │          │░░░░░░░░░░│          │          │          │          │
                              [1.5.4] AI Anomaly Detective (2-3d)
         │          │          │          │░░░░░░░░░░│░░░░░░░░░░│          │          │
                                          [2.1] Grid India load ingestion (5-7d)
         │          │          │          │░░░░░░░░░░│░░░░░░░░░░│          │          │
                                          [2.2] Substation enrichment (3-5d)
         │          │          │          │░░░░░░░░░░│░░░░░░░░░░│░░░░░░░░░░│          │
                                          [2.3] PV data sourcing (ongoing → plant approach)
         │          │          │          │          │          │░░░░░░░░░░│░░░░░░░░░░│
                                                                [3.1] Retrain load (2-3d)
         │          │          │          │          │          │░░░░░░░░░░│░░░░░░░░░░│░░░░░░░░░░
                                                                [3.2] RL environment (5-7d)
         │          │          │          │          │          │          │          │░░░░░░░░░░
                                                                                      [3.3] Agent promo
                                                                                      + plant visit
```

**Total estimated effort:** 45-60 working days across 10 calendar weeks  
**Critical path:** Phase 1.5 (AI agents) → Phase 2.1 (load data) → Phase 3.1 (retrain) → Phase 3.2 (RL)  
**Plant approach:** Letter sent Week 4, follow-up Week 6, data expected Week 8-10

---

## Milestones & Decision Gates

| Week | Milestone | Success Criterion | Go/No-Go |
|------|-----------|-------------------|-----------|
| 1 | M0: Foundation complete | All tests pass, Docker up, registries unified | Auto |
| 3 | M1: First real INR DSM charge | KERC 2026 endpoint returns valid INR/kWh | Auto |
| 3 | M1b: NASA POWER live | Fallback provider serves real GHI when Open-Meteo is down | Auto |
| 5 | M2: Regional load ingested | ≥6 months Southern Region hourly data in parquet | Auto |
| 5 | M2b: Substations enriched | ≥30% of 344 substations have capacity_mva ≠ null | Inspect |
| 6 | M3: Load model retrained | R² > 0.88 on regional held-out (better than national) | Metric |
| 8 | M4: RL policy trained | Policy reduces avg deviation vs naive by ≥10% | Metric |
| 8 | M4b: Agent promotion | ≥80% of agents at COMPLETE status | Count |

---

## Risk Register

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Grid India/NPP website unavailable or blocks scraping | HIGH (blocks Phase 2.1, 3.1, 3.2) | MEDIUM | Cache aggressively; download in bulk during available windows; explore Wattfeed.com as alternative |
| IndiaAI/Aikosh dataset contains "planned" not "current" capacity | MEDIUM (substation enrichment degraded) | MEDIUM | Inspect before building pipeline; fallback to KPTCL annual report PDFs |
| KERC 2026 regulation challenged or amended before implementation | LOW (rates change) | LOW | Design slab structure as configurable; rates are KERC-order-versioned |
| PV generation partnership fails to materialize | HIGH (blocks full RL) | HIGH | Proceed with irradiance-estimated PV (label honestly); KPCL published data as partial proxy |
| Open-Meteo rate limiting increases | LOW | LOW | NASA POWER fallback covers this; aggressive Redis caching |
| Southern Region ≠ Karnataka (proxy quality) | MEDIUM | CERTAIN | Label as `REAL_INDIA_SOUTHERN_REGION`, not `REAL_KARNATAKA`; document the approximation |

---

## Implementation Workflow Per Item

Each roadmap item follows this standard workflow:

```
┌────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐    ┌────────────┐
│ 1. RESEARCH│───▶│ 2. IMPLEMENT │───▶│ 3. TEST     │───▶│ 4. INTEGRATE │───▶│ 5. DOCUMENT│
│            │    │              │    │             │    │              │    │            │
│ - Source   │    │ - Provider/  │    │ - Unit tests│    │ - Wire into  │    │ - Model    │
│   access   │    │   Parser     │    │ - Fixture   │    │   orchestr.  │    │   card     │
│ - Schema   │    │ - Ingestion  │    │   data      │    │ - API route  │    │ - Source   │
│   design   │    │ - Validation │    │ - Edge      │    │ - Frontend   │    │   registry │
│ - Feasib.  │    │ - Storage    │    │   cases     │    │   update     │    │ - Docs     │
└────────────┘    └──────────────┘    └─────────────┘    └──────────────┘    └────────────┘
```

### Testing Strategy Per Phase

- **Phase 0:** Regression — all 93 existing tests must still pass
- **Phase 1:** New unit tests + integration tests for each provider/parser (target +20 tests)
- **Phase 2:** Data quality tests (row counts, date ranges, null percentages, cross-validation)
- **Phase 3:** ML evaluation tests (metric thresholds as assertions), RL convergence tests

---

## Success Criteria (End of Week 10)

The platform transitions from "partially data-complete prototype" to "production-capable with real AI" when:

1. **Real AI agents running** — LLM-powered orchestrator, explanation, anomaly detective via OpenRouter ✓
2. **DSM emits real INR charges** — `emits_rupee_values=true` for KERC 2026 profile ✓
3. **Two runtime weather sources** — Open-Meteo primary + NASA POWER fallback ✓
4. **Regional load data** — Southern Region or Karnataka-specific, ≥6 months hourly ✓
5. **Substation capacity** — ≥30% of substations enriched from KPTCL data ✓
6. **Load model upgraded** — R² improvement over India-national baseline ✓
7. **APP_DATA_MODE globally enforced** — no route leaks synthetic data in real mode ✓
8. **Docker verified** — full stack builds and passes healthchecks ✓
9. **Registries unified** — single source-of-truth for all provenance ✓
10. **Test count** — ≥130 tests passing (from current 93) ✓
11. **RL policy trained** — even if on estimated PV, with honest labeling ✓
12. **Plant approach initiated** — formal data request sent, follow-up done, partnership status known ✓

### Plant Approach Strategy (Phase 3 — the final piece)

The **real PV generation data** is the last and most valuable piece. Strategy:

```
Week 4:  Send formal data request letter (via DBIT institutional channel)
         ├── KPCL (Karnataka Power Corporation) — 4 operational solar plants
         ├── BESCOM — aggregate SRTPV generation data
         └── Commercial solar farms near Bengaluru (10-50 MW range)

Week 6:  Follow-up calls/emails + in-person visit if needed
         └── Offer: SuryaGrid forecasting as value-add to the plant operator

Week 8:  Expected: data sharing agreement or sample dataset
         └── If successful: ingest → validate → retrain PV model → label REAL_KARNATAKA

Week 10: Full integration or honest documentation of what's still pending
```

**What to ask for:**
- Hourly AC power output (kW/MW) with timestamps
- Inverter-level data (if available)
- Plant capacity (MW DC / MW AC)
- Any co-located irradiance measurements (pyranometer)
- At least 6 months of history for ML training

**What to offer in return:**
- Free forecast service for their plant
- Anomaly/maintenance alerts from the AI detective agent
- DSM deviation warnings before penalties hit

### What remains "honestly pending" after this plan:
- **Real-time KPTCL-SLDC telemetry** (requires formal government data-sharing agreement — months/years)
- **CERC DSM rates** for inter-state transactions (under Karnataka HC litigation, intentionally deferred)
- **On-site pyranometer validation** (ground truth vs satellite GHI — needs physical hardware)
- **Production-grade RL** — depends on real local PV + load converging; may stay PARTIAL

---

## Immediate Next Actions (This Week)

1. **Start Phase 0.3 first** — Docker verification is fastest (1 day) and unblocks CI/CD confidence
2. **In parallel: Phase 0.1** — Audit all routes for synthetic leakage
3. **Begin Phase 1.1** — NASA POWER provider (clear spec, no blockers)
4. **Get OpenRouter API key** — sign up at `openrouter.ai`, add to `.env`
5. **Download KPTCL Aikosh dataset** — inspect JSON structure before committing to Phase 2.2
6. **Draft PV data request letter** — plant approach has longest lead time, send ASAP
7. **Install LangGraph** — `pip install langgraph langchain-core langchain-openai` for Phase 1.5

---

## Cost Estimate (OpenRouter LLM Usage)

| Agent | Calls/day | Model | Est. tokens/call | Daily cost |
|-------|-----------|-------|------------------|------------|
| Orchestrator | ~50 | Claude Sonnet | ~2K in + 1K out | ~$0.45 |
| Explanation | ~50 | GPT-4o | ~1.5K in + 500 out | ~$0.25 |
| Anomaly Det. | ~24 (hourly) | Mistral Large | ~3K in + 500 out | ~$0.10 |
| **Total** | | | | **~$0.80/day** |

At production scale (100+ users, frequent queries), budget ~$25-50/month for OpenRouter. Use caching aggressively — same numeric inputs → same explanation (cache 1 hour).

---

*Document generated: 9 July 2026 | Author: SuryaGrid Project | Status: ACTIVE*  
*LLM Provider: OpenRouter (openrouter.ai) | Framework: LangGraph | Models: configurable per agent*

