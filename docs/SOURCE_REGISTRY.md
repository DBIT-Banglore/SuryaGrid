# SuryaGrid AI — Source Registry (Phase 1.5)

> **Source-first rule.** No formula, DSM threshold, penalty rate, solar constant,
> weather field, or dataset assumption in this system is arbitrary. Every value is
> classified below and carries a source. Values with no verifiable official source
> are kept **configurable** (never silently hardcoded) and marked accordingly.
>
> Code that consumes any of these values links back here with a comment:
> `# SOURCE: docs/SOURCE_REGISTRY.md#<anchor>`. The machine-readable mirror of this
> file is `backend/app/data_sources/source_registry.py` (same source IDs).

Last reviewed: **2026-07-05**. Maintained by: SuryaGrid AI Phase 1.5.

---

## 1. Classification scheme

Every value is exactly one of:

| Class | Meaning | Example |
|-------|---------|---------|
| `OFFICIAL_SOURCE` | Published by an official/authoritative body and verifiable at a URL. | CERC DSM Regulations 2024 framework; Open-Meteo field definitions. |
| `DATASET_DERIVED` | Computed/estimated from an ingested dataset. | Irradiance→generation scale factor fitted from Kaggle data. |
| `MODEL_LEARNED` | Learned by a trained ML model from data. | `predicted_generation_mw` from the RandomForest model. |
| `USER_CONFIGURABLE` | Set by the operator; no single universal value exists. | DSM penalty rate for a specific region/regulator. |
| `FALLBACK_DEFAULT` | A transparent default used only when nothing better is available. | Default tilt = latitude; default inverter efficiency 0.96. |

A value may be `USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE` when a regulator *does*
publish it but the exact current figure needs live verification/subscription; the
framework is `OFFICIAL_SOURCE`, the number is operator-supplied until verified.

---

## 2. Source verification status

Verification performed live on **2026-07-05** via web search of primary/official pages.

| Source ID | Verified | How |
|-----------|----------|-----|
| `SRC-OPENMETEO-001` | ✅ live | open-meteo.com/en/docs — field names & units confirmed |
| `SRC-KAGGLE-SOLAR-001` | ✅ live | Kaggle "Solar Radiation Prediction" (NASA HI-SEAS) columns confirmed |
| `SRC-OSM-SUBSTATION-001` | ✅ live | OSM `power=substation` tag + Overpass API + ODbL confirmed |
| `SRC-CERC-DSM-2024` | ✅ framework | CERC DSM & Related Matters Regulations, 2024 confirmed; exact 'X'/rate values PENDING |
| `SRC-KERC-DSM` | ⚠️ framework | KERC F&S&DSM framework (±5% solar band) — exact current slab order PENDING |
| `SRC-PVLIB-001` | ✅ | pvlib-python documented models (Erbs, Faiman, PVWatts, Ineichen) |
| `SRC-NSRDB-001` | ✅ live | **Verified 2026-08-26**: real Bengaluru download via developer.nlr.gov (8760 rows, SUNY India 2014). Lab renamed NREL→NLR; nrel.gov NXDOMAINs — old docs/pvlib URLs must use `.nlr.gov`. Free key required. Historical-only. |
| `SRC-NASA-POWER-001` | ⏳ pending | endpoint structure known; not yet wired (future provider) |
| `SRC-SOLCAST-001` | ⏳ pending | requires API key; modular slot reserved |

---

## 3. Master value registry

### 3.1 Weather / irradiance fields  → see `DATA_SOURCE_CATALOG.md`

<a name="src-openmeteo-001"></a>
**`SRC-OPENMETEO-001` — Open-Meteo Forecast API** — `OFFICIAL_SOURCE`
- URL: https://open-meteo.com/en/docs (accessed 2026-07-05)
- License: CC BY 4.0, free & key-less for non-commercial use; attribution required.
- Fields used (all irradiance in **W/m²**, averaged over the preceding hour):
  | Our field | Open-Meteo variable | Unit |
  |-----------|--------------------|------|
  | `irradiance_w_m2` (GHI) | `shortwave_radiation` | W/m² |
  | `dni_w_m2` | `direct_normal_irradiance` | W/m² |
  | `dhi_w_m2` | `diffuse_radiation` | W/m² |
  | `temperature_c` | `temperature_2m` | °C |
  | `humidity_percent` | `relative_humidity_2m` | % |
  | `cloud_cover_percent` | `cloud_cover` | % |
  | `wind_speed_mps` | `wind_speed_10m` | m/s |
  | `pressure_hpa` | `surface_pressure` | hPa |
  | `precipitation_probability_percent` | `precipitation_probability` | % |
  | `weather_code` | `weather_code` | WMO code |
- Limits: no hard key limit; fair-use ~10,000 calls/day. Forecast horizon up to 16 days.
- Notes: `&past_days=` and `&forecast_hours=`/`&past_hours=` refine the window. The
  archive API (`archive-api.open-meteo.com`) serves ERA5 reanalysis history.

### 3.2 Historical ML dataset  → see `DATA_SOURCE_CATALOG.md`

<a name="src-nsrdb-001"></a>
**`SRC-NSRDB-001` — NLR NSRDB (satellite-derived historical irradiance; ex-NREL)** — `OFFICIAL_SOURCE`
- URL: https://developer.nlr.gov/docs/solar/nsrdb/ (**live-verified 2026-08-26** with a real
  Bengaluru download). ⚠️ The laboratory was renamed **NREL → NLR** (National Laboratory of the
  Rockies) and `nrel.gov` now NXDOMAINs — all older references (incl. pvlib docs) must read `.nlr.gov`.
- License: free with a developer key (https://developer.nlr.gov/signup).
- India coverage (queried at POINT(77.59 12.97)): `suny-india` 2000–2014 hourly,
  `himawari` 2016–2020 at 10/30/60-min, plus `himawari-tmy`. PSM3 Americas datasets do NOT cover India.
- Fields used (all irradiance in **W/m²**):
  | Our field | Request attribute | Response column |
  |-----------|-------------------|-----------------|
  | `ghi_w_m2` | `ghi` | `GHI` |
  | `dni_w_m2` | `dni` | `DNI` |
  | `dhi_w_m2` | `dhi` | `DHI` |
  | `temperature_c` | `air_temperature` | `Temperature` |
  | `wind_speed_mps` | `wind_speed` | `Wind Speed` |
  | `pressure_hpa` | `surface_pressure` | `Pressure` |
- Response format: HTTP 302 → pre-signed S3 CSV; row0 site metadata, row1 units, row2 field
  names, row3+ data in local standard time; `-999` = missing.
- Role: HISTORICAL only (training / backtesting / cross-validation of Open-Meteo). It never
  serves live forecasts; missing key raises `NOT_AVAILABLE` (503), never a silent fallback.
- Code: `app/providers/nsrdb.py`, `app/data_sources/nsrdb_provider.py`; config `NREL_API_KEY`.
- Sample kept at `backend/data/nsrdb_suny_bengaluru_2014_sample.csv` (8760 rows, full year 2014).

<a name="src-kaggle-solar-001"></a>
**`SRC-KAGGLE-SOLAR-001` — Kaggle Solar Radiation Prediction (NASA HI-SEAS)** — `OFFICIAL_SOURCE` (dataset), values fitted from it are `DATASET_DERIVED`
- Dataset: "Solar Radiation Prediction" (owner: *dronio*), meteorological data from
  the NASA HI-SEAS mission, Sep–Dec 2016. Kaggle slug: `dronio/SolarEnergy`.
- URL: https://www.kaggle.com/datasets/dronio/SolarEnergy (accessed 2026-07-05)
- License: CC0 / public-domain style (per dataset page — verify before redistribution).
- Download: Kaggle API (`kaggle datasets download -d dronio/SolarEnergy`) using
  `KAGGLE_USERNAME`/`KAGGLE_KEY`; or manual placement in `backend/data/raw/kaggle/`.
- Columns (raw): `UNIXTime`, `Data`, `Time`, `Radiation` (W/m², **target**),
  `Temperature` (°F), `Pressure` (inHg), `Humidity` (%), `WindDirection(Degrees)`,
  `Speed` (mph), `TimeSunRise`, `TimeSunSet`.
- Unit conversions applied by `kaggle_solar_provider` (see `FORMULA_SOURCES.md`):
  °F→°C, inHg→hPa, mph→m/s. Column mapping is declared in `source_registry.py`.

### 3.3 Substation / grid location data  → see `LOCATION_AND_SUBSTATION_DATA.md`

<a name="src-osm-substation-001"></a>
**`SRC-OSM-SUBSTATION-001` — OpenStreetMap substations via Overpass API** — `OFFICIAL_SOURCE` (community/open) with per-record `source_confidence`
- Tag: `power=substation` (nodes/ways/relations); attributes: `voltage`, `operator`, `name`.
- Overpass endpoint: https://overpass-api.de/api/interpreter (accessed 2026-07-05)
- License: **ODbL 1.0** — attribution "© OpenStreetMap contributors" required; share-alike.
- Confidence: OSM completeness varies by region → each imported record stores
  `source_confidence` ∈ [0,1] (default 0.6 for OSM, 1.0 for operator-provided CSV).
- Coordinates are used **as published**; the system never invents coordinates.

### 3.4 DSM rules  → see `DSM_RULE_SOURCES.md`

<a name="src-cerc-dsm-2024"></a>
**`SRC-CERC-DSM-2024` — CERC (Deviation Settlement Mechanism & Related Matters) Regulations, 2024** — framework `OFFICIAL_SOURCE`, exact rates `USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE`
- Issued by the Central Electricity Regulatory Commission, India (notified 2024).
- Deviation for Wind-Solar sellers computed with **available capacity** as denominator
  (Reg. 6(2)(a)); the multiplier 'X' and reference charge rates are set by CERC order
  and revised periodically → kept configurable in DSM rule profiles.
- Reference: CERC official site https://cercind.gov.in (regulations section).

<a name="src-kerc-dsm"></a>
**`SRC-KERC-DSM` — KERC Forecasting, Scheduling & DSM (Karnataka)** — framework `OFFICIAL_SOURCE`, slab rates `USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE`
- Karnataka intra-state framework; solar tolerance band retained at **±5%**.
- Escalating slab charges (default 2/4/6 ₹/kWh over 5–10/10–15/15%+ bands) are
  **representative defaults** pending the exact current KERC order; fully configurable.
- Reference: KERC official site https://karnatakaerc.gov.in.

### 3.5 PV physics constants & models  → see `FORMULA_SOURCES.md`

<a name="src-pvlib-001"></a>
**`SRC-PVLIB-001` — pvlib-python models** — `OFFICIAL_SOURCE` (documented, peer-reviewed models)
- Erbs decomposition (GHI→DNI/DHI), Ineichen clear-sky, Faiman cell temperature,
  PVWatts DC & inverter models. URL: https://pvlib-python.readthedocs.io.

| Constant | Value | Class | Source / anchor |
|----------|-------|-------|-----------------|
| Temperature coefficient γ (`gamma_pdc`) | −0.0035 /°C (−0.35 %/°C) | `FALLBACK_DEFAULT` | typical c-Si; site-overridable — `FORMULA_SOURCES.md#gamma` |
| Inverter nominal efficiency | 0.96 | `FALLBACK_DEFAULT` | PVWatts default — `FORMULA_SOURCES.md#inverter` |
| Default tilt | ≈ latitude (20° generic) | `FALLBACK_DEFAULT` | fixed-tilt heuristic — `FORMULA_SOURCES.md#tilt` |
| Default azimuth | 180° (south, N. hemisphere) | `FALLBACK_DEFAULT` | `FORMULA_SOURCES.md#azimuth` |
| Solar constant | 1361 W/m² | `OFFICIAL_SOURCE` | WMO/pvlib — `FORMULA_SOURCES.md#solar-constant` |

### 3.6 Operator / economic parameters

| Parameter | Default | Class | Notes |
|-----------|---------|-------|-------|
| `penalty_rate_per_mwh` | 12000 ₹/MWh | `USER_CONFIGURABLE` | placeholder; real value depends on regulator/market — set per site/profile |
| `allowed_dsm_threshold_percent` | 10% generic / 5% KERC-solar | `USER_CONFIGURABLE` | band depends on regulator & generator type |
| DSM slab rates | 2/4/6 ₹/kWh | `USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE` | representative; override per current order |

---

## 4. How code links to this registry

- Python: `from app.data_sources.source_registry import SOURCES, get_source` returns
  structured `SourceRecord`s (id, name, url, license, access_date, classification, unit,
  fields, notes). API surface: `GET /api/v1/sources`, `GET /api/v1/sources/{id}`.
- Every hardcoded-looking constant carries an inline comment referencing its anchor here.
- The prediction API response includes a `sources[]` array citing the exact records used
  for that result (formula / dataset / weather / dsm_rule).

## 5. Pending verification / honesty log

- CERC 'X' multiplier and normal-rate-of-charge figures: **not** hardcoded as regulatory
  truth. Marked `USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE`. The system does **not** claim
  regulatory accuracy for any specific penalty figure.
- KERC exact current slab order: representative defaults only.
- Solcast & NASA POWER: provider slots reserved, not yet wired.
