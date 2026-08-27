"""Dynamic risk scoring - weighted deviation + PV-health composite + DSM risk classification.

Project-standard formula (see docs/FORMULA_SOURCES.md#11-dynamic-risk-score):

    dev_pct          = |actual_kwh - scheduled_kwh| / scheduled_kwh x 100
    pv_risk_component = (1 - clamp(pv_score, 0, 1)) x 100
    raw_score         = w_dev x dev_pct + w_pv x pv_risk_component
    dynamic_risk_score = clamp(raw_score, 0, 100)

Defaults w_dev=0.6, w_pv=0.4 (deviation dominates; PV health is the secondary
signal). Transparent and reproducible - no ML in the scoring path.

DSM risk classification (see docs/FORMULA_SOURCES.md#14-dsm-risk-classification):

    deviation %    risk level   action                    penalty slab
    0–5%           NORMAL       No action                 no penalty (within ±5% band)
    5–10%          MODERATE     Monitor                   ₹2/kWh on energy beyond band
    10–15%         HIGH          Investigate               ₹4/kWh on energy beyond band
    >15%           CRITICAL      Manual inspection needed  ₹6/kWh (100% of PP rate)
"""

from __future__ import annotations

W_DEV_DEFAULT = 0.6
W_PV_DEFAULT = 0.4

# DSM risk classification thresholds (deviation %).
# The slab rates match the KERC solar default slabs (₹2 / ₹4 / ₹6 per kWh).
RISK_NORMAL_MAX = 5.0
RISK_MODERATE_MAX = 10.0
RISK_HIGH_MAX = 15.0

# Penalty slab rates (INR per kWh) for each tier.
RATE_MODERATE = 2.0
RATE_HIGH = 4.0
RATE_CRITICAL = 6.0

# Dynamic risk score thresholds (0-100 composite score).
# User spec: 0-15 NORMAL, 16-40 MODERATE, 41-71 HIGH, >71 CRITICAL.
SCORE_NORMAL_MAX = 15.0
SCORE_MODERATE_MAX = 40.0
SCORE_HIGH_MAX = 71.0


def classify_score_risk(score: float) -> dict:
    """Classify the dynamic risk *score* (0-100) into a risk level and action.

    Uses the thresholds: ≤15 NORMAL, 16-40 MODERATE, 41-71 HIGH, >71 CRITICAL.
    This is separate from classify_dsm_risk() which uses deviation % directly.
    """
    if score <= SCORE_NORMAL_MAX:
        return {
            "risk_level": "NORMAL",
            "action": "No action — risk score within normal range",
            "penalty_slab": None,
            "rate_inr_per_kwh": 0.0,
        }
    if score <= SCORE_MODERATE_MAX:
        return {
            "risk_level": "MODERATE",
            "action": "Monitor — DSM deviation less than 10%",
            "penalty_slab": "5–10%",
            "rate_inr_per_kwh": RATE_MODERATE,
        }
    if score <= SCORE_HIGH_MAX:
        return {
            "risk_level": "HIGH",
            "action": "Investigate — DSM more than 10%",
            "penalty_slab": "10–15%",
            "rate_inr_per_kwh": RATE_HIGH,
        }
    return {
        "risk_level": "CRITICAL",
        "action": "Manual inspection needed — DSM greater than 15%",
        "penalty_slab": ">15%",
        "rate_inr_per_kwh": RATE_CRITICAL,
    }


def classify_dsm_risk(deviation_percent: float) -> dict:
    """Map a DSM deviation percentage to a risk level, action, and penalty slab.

    Returns a dict with:
      - risk_level: NORMAL | MODERATE | HIGH | CRITICAL
      - action:     human-readable recommended action
      - penalty_slab: the slab range string (or None when within band)
      - rate_inr_per_kwh: the INR/kWh rate for the slab (0.0 when within band)
    """
    if deviation_percent <= RISK_NORMAL_MAX:
        return {
            "risk_level": "NORMAL",
            "action": "No action — within ±5% tolerance band",
            "penalty_slab": None,
            "rate_inr_per_kwh": 0.0,
        }
    if deviation_percent <= RISK_MODERATE_MAX:
        return {
            "risk_level": "MODERATE",
            "action": "Monitor — deviation under 10%",
            "penalty_slab": "5–10%",
            "rate_inr_per_kwh": RATE_MODERATE,
        }
    if deviation_percent <= RISK_HIGH_MAX:
        return {
            "risk_level": "HIGH",
            "action": "Investigate — deviation exceeds 10%",
            "penalty_slab": "10–15%",
            "rate_inr_per_kwh": RATE_HIGH,
        }
    return {
        "risk_level": "CRITICAL",
        "action": "Manual inspection needed — deviation exceeds 15%",
        "penalty_slab": ">15%",
        "rate_inr_per_kwh": RATE_CRITICAL,
    }


def calculate_dynamic_risk_score(
    actual_kwh: float,
    scheduled_kwh: float,
    pv_score: float,
    w_dev: float = W_DEV_DEFAULT,
    w_pv: float = W_PV_DEFAULT,
) -> dict:
    """Composite operational risk from deviation % and PV health score.

    Returns deviation_pct, pv_risk_component, dynamic_risk_score (0-100),
    risk_level, action, and penalty_slab.
    """
    # 1. Percentage deviation against the schedule (guard zero/negative schedule).
    if scheduled_kwh is None or scheduled_kwh <= 0:
        dev_pct = 0.0
    else:
        dev_pct = (abs(actual_kwh - scheduled_kwh) / scheduled_kwh) * 100

    # 2. PV health scaled to risk space: a perfect 1.0 score contributes 0.
    pv_risk_component = (1.0 - max(0.0, min(1.0, pv_score))) * 100

    # 3. Weighted composite.
    raw_score = (w_dev * dev_pct) + (w_pv * pv_risk_component)

    # 4. Cap to [0, 100].
    final_risk_score = round(min(100.0, max(0.0, raw_score)), 2)

    # 5. Risk classification from the composite score value (0-100).
    # The score-based thresholds are: ≤15 NORMAL, 16-40 MODERATE,
    # 41-71 HIGH, >71 CRITICAL (per user spec).
    risk = classify_score_risk(final_risk_score)

    return {
        "deviation_pct": round(dev_pct, 2),
        "pv_risk_component": round(pv_risk_component, 2),
        "dynamic_risk_score": final_risk_score,
        "risk_level": risk["risk_level"],
        "action": risk["action"],
        "penalty_slab": risk["penalty_slab"],
        "rate_inr_per_kwh": risk["rate_inr_per_kwh"],
    }
