# SuryaGrid AI — Formula Sources

Every formula used in the numeric path, with its source and classification. The
numeric path is **deterministic** (pvlib / plain Python) — no LLM performs math.

See also: `SOURCE_REGISTRY.md`, `DSM_RULE_SOURCES.md`.

---

## 1. Irradiance decomposition (GHI → DNI/DHI)

<a name="erbs"></a>
- **Closure equation** (verified live against NSRDB Himawari 2019 Bengaluru data,
  4,099 daylight hours, closure MAE 0.4 W/m² ≈ 0.13%):
  `GHI = DNI·cos(θz) + DHI` where θz is the solar zenith angle
  (angle between the sun and the local vertical).
- **Used when** a source supplies GHI only (e.g. Kaggle `Radiation`, some providers).
- **Model:** Erbs correlation. `dni, dhi = pvlib.irradiance.erbs(ghi, zenith, datetime)`.
- **Class:** `OFFICIAL_SOURCE` — `SRC-PVLIB-001`.
- **Ref:** Erbs, Klein & Duffie (1982); pvlib `irradiance.erbs`.
- **Code:** `app/agents/forecast_agent.py::_resolve_components`.

## 2. Plane-of-array (POA) transposition

- `pvlib.irradiance.get_total_irradiance(tilt, azimuth, zenith, azimuth_sun, dni, ghi, dhi)`.
- Isotropic-family sky diffuse model (pvlib default). **Class:** `OFFICIAL_SOURCE` — `SRC-PVLIB-001`.
- **Code:** `forecast_agent.py::_poa`.

## 3. Clear-sky baseline

- `Location.get_clearsky(index, model="ineichen")` — Ineichen–Perez clear-sky model.
- Used to derive the day-ahead committed **schedule proxy** when no declared schedule
  is supplied. **Class of the resulting schedule:** `MODEL_LEARNED`/`DATASET_DERIVED`
  proxy, clearly labelled — it is *not* a regulator-declared schedule.
- **Code:** `forecast_agent.py::forecast_timeline`.

## 4. Cell temperature

<a name="faiman"></a>
- `pvlib.temperature.faiman(poa_global, temp_air, wind_speed)`. **Class:** `OFFICIAL_SOURCE` — `SRC-PVLIB-001`.
- **Ref:** Faiman (2008); pvlib `temperature.faiman`.

## 5. DC power (PVWatts)

- `pvlib.pvsystem.pvwatts_dc(poa_global, temp_cell, pdc0, gamma_pdc)`.
- `pdc0` = nameplate capacity in W (capacity_mw × 1e6). **Class:** `OFFICIAL_SOURCE` — `SRC-PVLIB-001`.

<a name="gamma"></a>
- **γ (`gamma_pdc`) = −0.0035 /°C.** Typical crystalline-silicon temperature coefficient.
  **Class:** `FALLBACK_DEFAULT` — override per module datasheet. `SOURCE_REGISTRY.md#src-pvlib-001`.

## 6. AC power (inverter)

<a name="inverter"></a>
- `pvlib.inverter.pvwatts(pdc, pdc0, eta_inv_nom=0.96)`.
- **Inverter nominal efficiency 0.96** — PVWatts default. **Class:** `FALLBACK_DEFAULT`.
- Output clipped to `[0, capacity_mw]`. **Code:** `forecast_agent.py::_ac_power_mw`.

## 7. Irradiance → generation conversion (ML fallback path)

<a name="irradiance-to-gen"></a>
When the dataset provides **irradiance only** (no plant generation), the ML model
predicts irradiance and we convert to generation with the **same pvlib pipeline**
(steps 2–6). If a fast linear proxy is needed:

```
generation_mw ≈ (poa_w_m2 / 1000) * capacity_mw * panel_efficiency * performance_ratio
```

- `performance_ratio` default **0.80** — `FALLBACK_DEFAULT` (typical utility-scale PR).
- `panel_efficiency` is a site attribute (`USER_CONFIGURABLE`).
- **This proxy is documented, not silent:** the response reports `source_used` and the
  `sources[]` entry marks it `formula` with this anchor.

## 8. Confidence score

<a name="confidence"></a>
- `confidence = clamp(1 − 0.35·cloud_fraction, 0.4, 0.99)`, raised to ≥0.9 in near-dark hours.
- **Class:** `FALLBACK_DEFAULT` (transparent heuristic, tunable). **Code:** `forecast_agent.py::_confidence`.
- Hybrid mode blends formula & ML confidence — see `ML_PIPELINE.md`.

## 9. Deviation & DSM (summary — full detail in `DSM_RULE_SOURCES.md`)

```
deviation_mw        = actual_or_predicted_mw − scheduled_mw
DSM_deviation_pct   = ((|deviation_mw| / time_interval_hours) × block_hours
                       / denominator) × 100
                      denominator = available_capacity (CERC 6(2)(a)) OR scheduled (simple mode)
direction           = UNDER_INJECTION | OVER_INJECTION | WITHIN_LIMIT
chargeable_energy   = Σ over slabs of (pct_in_slab/100 × capacity × interval_hours)
dsm_charge          = Σ chargeable_energy_slab_kWh × slab_rate
```
- **Interval normalisation** (project standard): the MW imbalance is divided by the
  evaluation interval in hours, so a 3 MW imbalance spread over one hour scores
  differently from the same 3 MW inside a single 15-min block. When `interval_hours`
  equals the profile's own `time_block_minutes`, the formula reduces to the classic
  per-block percentage.
- Denominator choice, band, and slab rates are `USER_CONFIGURABLE` per rule profile.

## 10. Unit conversions (Kaggle ingestion)

<a name="unit-conversions"></a>
| From | To | Formula | Class |
|------|----|---------|-------|
| °F | °C | `(f − 32) × 5/9` | `OFFICIAL_SOURCE` (standard) |
| inHg | hPa | `inHg × 33.8639` | `OFFICIAL_SOURCE` (standard) |
| mph | m/s | `mph × 0.44704` | `OFFICIAL_SOURCE` (standard) |
- **Code:** `app/data_sources/kaggle_solar_provider.py`.

## 11. Dynamic risk score

<a name="dynamic-risk-score"></a>
Project-standard composite operational risk (`app/agents/dynamic_risk.py`):

```
deviation_pct       = |actual_kwh − scheduled_kwh| / scheduled_kwh × 100
pv_risk_component   = (1 − clamp(pv_score, 0, 1)) × 100
raw_score           = w_dev × deviation_pct + w_pv × pv_risk_component
dynamic_risk_score  = clamp(raw_score, 0, 100)
```
- **Defaults: `w_dev = 0.6`, `w_pv = 0.4`** — deviation dominates; PV health is the
  secondary signal. Weights are overridable parameters but the defaults are fixed
  project constants (`W_DEV_DEFAULT` / `W_PV_DEFAULT`).
- **Class:** `FALLBACK_DEFAULT` (transparent, reproducible; no ML in the scoring path).
- Exposed at `POST /api/v1/dsm/advanced-check` as `result.dynamic_risk` and via
  `RiskAgent.dynamic_score()`. Reference example: 88 kWh actual vs 100 kWh schedule
  with PV health 0.85 → dev 12%, PV-risk 15% → score **13.2**.

## 12. Fuzzy risk score

<a name="fuzzy"></a>
- Combines DSM breach ratio, forecast confidence, and cloud volatility into a 0–100
  score with LOW/MEDIUM/HIGH/CRITICAL bands via triangular membership functions.
- **Class:** `FALLBACK_DEFAULT` (transparent, tunable membership functions). **Code:**
  `app/agents/fuzzy_risk_agent.py`. Detailed in `AGENT_WORKFLOWS.md`.

## 13. Metrics (ML evaluation)

- MAE, RMSE, MAPE, R² — standard definitions (`sklearn.metrics`). **Class:** `OFFICIAL_SOURCE`.
- **Code:** `app/ml/train_model.py`.

## 14. DSM risk classification

<a name="dsm-risk-classification"></a>
Each DSM deviation percentage is mapped to a four-tier risk classification with a
recommended action and the applicable penalty slab rate:

| Deviation % | Risk level | Action | Penalty slab | Rate (₹/kWh) |
|---|---|---|---|---|
| 0–5% | **NORMAL** | No action — within ±5% tolerance band | — | 0.0 |
| 5–10% | **MODERATE** | Monitor — deviation under 10% | 5–10% | 2.0 |
| 10–15% | **HIGH** | Investigate — deviation exceeds 10% | 10–15% | 4.0 |
| >15% | **CRITICAL** | Manual inspection needed — deviation exceeds 15% | >15% | 6.0 |

- **Class:** `USER_CONFIGURABLE` — slab rates match the KERC solar default slabs
  (`app/dsm/india_dsm_rules.py::kerc_solar_profile`); thresholds are project-standard
  constants (`RISK_NORMAL_MAX=5`, `RISK_MODERATE_MAX=10`, `RISK_HIGH_MAX=15`).
- **Code:** `app/agents/dynamic_risk.py::classify_dsm_risk`,
  `app/dsm/dsm_engine.py::_result` (adds `risk_level`, `risk_action`, `penalty_slab`,
  `rate_inr_per_kwh` to every DSM engine result).
- The composite **dynamic risk score** (§11) uses the same four tiers but with
  score-based thresholds: `NORMAL ≤ 15`, `MODERATE 16–40`, `HIGH 41–71`,
  `CRITICAL > 71` — see `app/agents/fuzzy_risk_agent.py::_level`.
