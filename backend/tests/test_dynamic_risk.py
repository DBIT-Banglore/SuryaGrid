"""Tests for the dynamic risk score (deviation x 0.6 + PV-health x 0.4)
and the DSM risk classification (NORMAL/MODERATE/HIGH/CRITICAL)."""

from app.agents.dynamic_risk import (
    calculate_dynamic_risk_score,
    classify_dsm_risk,
    RISK_NORMAL_MAX,
    RISK_MODERATE_MAX,
    RISK_HIGH_MAX,
)
from app.agents.risk_agent import RiskAgent


def test_reference_example_from_spec():
    # Spec example: 12% deviation, PV health 0.85 -> 0.6*12 + 0.4*15 = 13.2
    # Score 13.2 ≤ 15 → NORMAL (score-based, not deviation-based)
    r = calculate_dynamic_risk_score(actual_kwh=88.0, scheduled_kwh=100.0, pv_score=0.85)
    assert r["deviation_pct"] == 12.0
    assert r["pv_risk_component"] == 15.0
    assert r["dynamic_risk_score"] == 13.2
    assert r["risk_level"] == "NORMAL"
    assert r["rate_inr_per_kwh"] == 0.0


def test_zero_deviation_healthy_pv_is_zero_risk():
    r = calculate_dynamic_risk_score(actual_kwh=100.0, scheduled_kwh=100.0, pv_score=1.0)
    assert r["dynamic_risk_score"] == 0.0


def test_max_inputs_cap_at_100():
    r = calculate_dynamic_risk_score(actual_kwh=500.0, scheduled_kwh=100.0, pv_score=0.0)
    assert r["dynamic_risk_score"] == 100.0
    assert r["pv_risk_component"] == 100.0


def test_pv_score_clamped_to_unit_range():
    # A pv_score above 1 (bad sensor) must not create negative risk.
    r = calculate_dynamic_risk_score(actual_kwh=100.0, scheduled_kwh=100.0, pv_score=7.5)
    assert r["pv_risk_component"] == 0.0


def test_weights_default_to_06_04_but_are_overridable():
    base = calculate_dynamic_risk_score(88.0, 100.0, 0.85)
    flipped = calculate_dynamic_risk_score(88.0, 100.0, 0.85, w_dev=0.4, w_pv=0.6)
    # 0.4*12 + 0.6*15 = 4.8 + 9 = 13.8 vs default 13.2
    assert base["dynamic_risk_score"] == 13.2
    assert flipped["dynamic_risk_score"] == 13.8


def test_negative_deviation_uses_absolute_value():
    over = calculate_dynamic_risk_score(actual_kwh=112.0, scheduled_kwh=100.0, pv_score=0.85)
    under = calculate_dynamic_risk_score(actual_kwh=88.0, scheduled_kwh=100.0, pv_score=0.85)
    assert over["deviation_pct"] == under["deviation_pct"] == 12.0


def test_risk_agent_exposes_dynamic_score_with_same_defaults():
    r = RiskAgent().dynamic_score(actual_kwh=88.0, scheduled_kwh=100.0, pv_score=0.85)
    assert r["dynamic_risk_score"] == 13.2


# --------------------------------------------------------------------------- #
# classify_dsm_risk — four-tier DSM deviation classification
# --------------------------------------------------------------------------- #

def test_classify_normal_within_band():
    r = classify_dsm_risk(0.0)
    assert r["risk_level"] == "NORMAL"
    assert r["penalty_slab"] is None
    assert r["rate_inr_per_kwh"] == 0.0
    r5 = classify_dsm_risk(RISK_NORMAL_MAX)
    assert r5["risk_level"] == "NORMAL"


def test_classify_moderate_5_to_10():
    r = classify_dsm_risk(7.0)
    assert r["risk_level"] == "MODERATE"
    assert r["action"] == "Monitor — deviation under 10%"
    assert r["penalty_slab"] == "5–10%"
    assert r["rate_inr_per_kwh"] == 2.0
    r10 = classify_dsm_risk(RISK_MODERATE_MAX)
    assert r10["risk_level"] == "MODERATE"


def test_classify_high_10_to_15():
    r = classify_dsm_risk(12.0)
    assert r["risk_level"] == "HIGH"
    assert r["action"] == "Investigate — deviation exceeds 10%"
    assert r["penalty_slab"] == "10–15%"
    assert r["rate_inr_per_kwh"] == 4.0
    r15 = classify_dsm_risk(RISK_HIGH_MAX)
    assert r15["risk_level"] == "HIGH"


def test_classify_critical_above_15():
    r = classify_dsm_risk(20.0)
    assert r["risk_level"] == "CRITICAL"
    assert r["action"] == "Manual inspection needed — deviation exceeds 15%"
    assert r["penalty_slab"] == ">15%"
    assert r["rate_inr_per_kwh"] == 6.0


def test_dynamic_risk_zero_division_guard():
    """A zero scheduled_kwh must not raise — returns 0 deviation. Score = 0.4*50 = 20 → MODERATE."""
    r = calculate_dynamic_risk_score(actual_kwh=50.0, scheduled_kwh=0.0, pv_score=0.5)
    assert r["deviation_pct"] == 0.0
    assert r["dynamic_risk_score"] == 20.0  # 0.4 * 50 = 20
    assert r["risk_level"] == "MODERATE"


def test_dynamic_risk_includes_risk_level_in_output():
    r = calculate_dynamic_risk_score(actual_kwh=80.0, scheduled_kwh=100.0, pv_score=0.9)
    assert "risk_level" in r
    assert "action" in r
    assert "penalty_slab" in r
    assert "rate_inr_per_kwh" in r
    assert r["deviation_pct"] == 20.0
    assert r["dynamic_risk_score"] == 16.0  # 0.6*20 + 0.4*10 = 12+4 = 16 → MODERATE
    assert r["risk_level"] == "MODERATE"
