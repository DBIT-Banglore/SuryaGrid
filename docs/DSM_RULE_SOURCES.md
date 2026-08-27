# SuryaGrid AI — DSM Rule Sources

> **DSM rules are not universal.** They vary by country, region, grid code, regulator,
> generator type, installed capacity, and time block. This system therefore models DSM
> as **configurable rule profiles** (region + regulator + bands + rates + effective
> dates), never a single hardcoded global value. Where an official figure is not
> verified live, the profile is marked `USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE`
> and the system does **not** claim regulatory accuracy.

See also: `SOURCE_REGISTRY.md`, `FORMULA_SOURCES.md#9-deviation--dsm`.

---

## 1. Frameworks referenced

### 1.1 CERC DSM Regulations, 2024 (India, inter-state) — `SRC-CERC-DSM-2024`
- **Body:** Central Electricity Regulatory Commission (CERC), India.
- **Instrument:** CERC (Deviation Settlement Mechanism and Related Matters)
  Regulations, 2024 (notified 2024).
- **Verified:** framework confirmed live 2026-07-05 (multiple legal/regulatory summaries).
- **Key rule modelled:** deviation (%) for Wind-Solar (WS) sellers is computed with
  **available capacity** as the denominator (Reg. 6(2)(a)); a multiplier **'X'** and the
  normal rate of charges are fixed by CERC order and revised periodically.
- **Classification:** framework = `OFFICIAL_SOURCE`; the numeric 'X' and charge rates =
  `USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE` (must be entered per the current CERC order).
- **Official site:** https://cercind.gov.in

### 1.2 KERC F&S&DSM (Karnataka, intra-state) — `SRC-KERC-DSM`
- **Body:** Karnataka Electricity Regulatory Commission (KERC); administered by
  Karnataka SLDC (KPTCL); Bangalore DISCOM = BESCOM.
- **Key rule modelled:** solar tolerance **band = ±5%**; charges apply to deviation
  **beyond** the band on an escalating **slab** basis.
- **Default slabs (representative, pending exact current order):**
  | Deviation band (% of available capacity) | Rate (₹/kWh) |
  |------------------------------------------|--------------|
  | 5 – 10 | 2.0 |
  | 10 – 15 | 4.0 |
  | > 15 | 6.0 |
- **Classification:** band & framework = `OFFICIAL_SOURCE`; slab rates =
  `USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE`.
- **Official site:** https://karnatakaerc.gov.in
- **Live feed:** metered injection requires a data-sharing agreement with Karnataka
  SLDC/BESCOM. Until then, "actual" is the pvlib nowcast — labelled `feed_mode=simulated`.

---

## 2. Rule profile model (how it is stored)

Profiles are data, not code. Tables (`dsm_rule_profiles`, `dsm_rule_bands`):

**`dsm_rule_profiles`**: `id, name, region, regulator, source_name, source_url,
source_status, denominator (available_capacity|scheduled), effective_from, effective_to,
time_block_minutes, notes`.

**`dsm_rule_bands`**: `id, profile_id, min_deviation_percent, max_deviation_percent,
direction (UNDER_INJECTION|OVER_INJECTION|BOTH), charge_formula, charge_rate, unit,
notes, source_reference`.

### Seeded profiles
| Profile | Region | Regulator | Band | Denominator | source_status |
|---------|--------|-----------|------|-------------|---------------|
| `cerc-2024-ws-generic` | India | CERC | X-based (config) | available_capacity | PENDING |
| `kerc-solar` | Karnataka | KERC/BESCOM | ±5% + slabs | available_capacity | PENDING (slabs) |
| `generic-configurable` | (any) | (operator) | ±10% flat | scheduled | USER_CONFIGURABLE |

---

## 3. DSM modes supported

1. **Simple threshold** — flat band; charge on energy beyond band at one rate.
   (Existing `DSMClassifierAgent` behaviour; preserved for backward compatibility.)
2. **Band / slab** — escalating per-slab charges (KERC style).
3. **Configurable rule profile** — full profile + bands resolved from the DB by
   `region`/`regulator`/`rule_profile_id`.

Engine: `app/dsm/dsm_engine.py`. Sources map: `app/dsm/dsm_sources.py`.

---

## 4. Outputs (per interval / per settlement)

`deviation_mw, deviation_percent, deviation_direction, dsm_band, penalty_status,
charge_rate, estimated_dsm_charge, rule_source, explanation, risk_level, risk_action,
penalty_slab, rate_inr_per_kwh`.

- `penalty_status ∈ {NO_PENALTY, PENALTY_RISK, WITHIN_LIMIT, INVALID_SCHEDULE}`.
- `rule_source` cites the profile's `source_name`+`source_url`+`source_status`.
- Divide-by-zero guarded: zero/negative denominator ⇒ `INVALID_SCHEDULE`, charge 0.
- `risk_level ∈ {NORMAL, MODERATE, HIGH, CRITICAL}` — see §6 below.

## 5. Honesty statement

This system provides **decision-support estimates**, not a settlement of record. The
penalty figures depend on the live regulatory order in force for the specific region,

---

## 5. Honesty statement

This system provides **decision-support estimates**, not a settlement of record. The
penalty figures depend on the live regulatory order in force for the specific region,
regulator, generator type, and period. Operators must load the current official rates
into the rule profile before treating any figure as authoritative. Profiles carrying
`USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE` are explicitly non-authoritative defaults.

---

## 6. DSM risk classification (deviation → level → action)

Every DSM evaluation now carries a four-tier risk classification based on the deviation
percentage. The slab rates match the KERC solar default slabs (₹2 / ₹4 / ₹6 per kWh).

| Deviation % | Risk level | Action | Penalty slab | Rate (₹/kWh) |
|---|---|---|---|---|
| 0–5% | **NORMAL** | No action — within ±5% tolerance band | — | 0.0 |
| 5–10% | **MODERATE** | Monitor — deviation under 10% | 5–10% | 2.0 |
| 10–15% | **HIGH** | Investigate — deviation exceeds 10% | 10–15% | 4.0 |
| >15% | **CRITICAL** | Manual inspection needed — deviation exceeds 15% | >15% | 6.0 |

- **Thresholds:** `RISK_NORMAL_MAX = 5.0`, `RISK_MODERATE_MAX = 10.0`,
  `RISK_HIGH_MAX = 15.0` (constants in `app/agents/dynamic_risk.py`).
- **Code:** `app/agents/dynamic_risk.py::classify_dsm_risk` — pure function, no ML.
- **Engine integration:** `app/dsm/dsm_engine.py::_result` adds `risk_level`,
  `risk_action`, `penalty_slab`, `rate_inr_per_kwh` to every DSM engine result.
- **Fuzzy risk alignment:** `app/agents/fuzzy_risk_agent.py::_level` uses the same
  thresholds: `<16 → LOW (Normal)`, `<41 → MEDIUM (Moderate)`, `≤71 → HIGH`,
  `>71 → CRITICAL`.
- See also: `docs/FORMULA_SOURCES.md#14-dsm-risk-classification`.
