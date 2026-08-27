"""Tests for the advanced DSM engine (configurable rule profiles)."""

from app.dsm.configurable_rules import generic_configurable_profile, simple_profile
from app.dsm.dsm_engine import DSMEngine
from app.dsm.india_dsm_rules import cerc_ws_generic_profile, kerc_solar_profile

engine = DSMEngine()


def test_within_band_no_penalty():
    r = engine.evaluate(
        kerc_solar_profile(), scheduled_mw=30, measured_mw=30, installed_capacity_mw=50
    )
    assert r["penalty_status"] == "NO_PENALTY"
    assert r["deviation_direction"] == "WITHIN_LIMIT"
    assert r["estimated_dsm_charge"] == 0.0


def test_kerc_slab_charge_math():
    # cap 50, sched 30, measured 24 -> deviation 6MW = 12% of capacity; band 5%.
    # slab 5-10% (5%): 0.05*50*0.25h=0.625 MWh * 2 INR/kWh*1000 = 1250
    # slab 10-12% (2%): 0.02*50*0.25h=0.25 MWh * 4 *1000 = 1000  -> total 2250
    r = engine.evaluate(kerc_solar_profile(), 30, 24, 50, interval_hours=0.25)
    assert r["penalty_status"] == "PENALTY_RISK"
    assert r["deviation_direction"] == "UNDER_INJECTION"
    assert r["estimated_dsm_charge"] == 2250.0
    assert len(r["slab_breakdown"]) == 2


def test_over_injection_direction():
    r = engine.evaluate(kerc_solar_profile(), 20, 30, 50, interval_hours=0.25)
    assert r["deviation_direction"] == "OVER_INJECTION"


def test_invalid_schedule_no_divide_by_zero():
    # generic profile uses scheduled as denominator; scheduled 0 -> INVALID
    r = engine.evaluate(
        generic_configurable_profile(), scheduled_mw=0, measured_mw=5, installed_capacity_mw=50
    )
    assert r["penalty_status"] == "INVALID_SCHEDULE"
    assert r["estimated_dsm_charge"] == 0.0


def test_simple_threshold_mode():
    p = simple_profile(tolerance_percent=10.0, penalty_rate_per_mwh=1000.0)
    # scheduled 10, measured 7 over interval_hours=1.0 with a 15-min block.
    # Interval-normalised deviation: (3/1.0)*(0.25)/10 x100 = 7.5% -> within the
    # 10% band, no penalty. The SAME 3MW inside ONE 15-min block breaches
    # (see next test) - that is exactly what interval normalisation encodes.
    r = engine.evaluate(
        p, scheduled_mw=10, measured_mw=7, installed_capacity_mw=50, interval_hours=1.0
    )
    assert r["penalty_status"] == "NO_PENALTY"
    assert r["estimated_dsm_charge"] == 0.0
    assert r["deviation_percent"] == 7.5


def test_simple_threshold_breach_in_single_block():
    # Same 3MW imbalance delivered within one 15-min block (interval == block):
    # formula reduces to the classic per-block % -> 30%, breaching the 10% band.
    p = simple_profile(tolerance_percent=10.0, penalty_rate_per_mwh=1000.0)
    r = engine.evaluate(
        p, scheduled_mw=10, measured_mw=7, installed_capacity_mw=50, interval_hours=0.25
    )
    assert r["penalty_status"] == "PENALTY_RISK"
    # chargeable slab 10-30% (20%): 0.20*10*0.25h = 0.5 MWh * 1000 INR/MWh = 500
    assert r["estimated_dsm_charge"] == 500.0
    assert r["deviation_percent"] == 30.0


def test_source_status_marked_pending_for_regulatory_profiles():
    assert kerc_solar_profile().source_status == "USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE"
    assert cerc_ws_generic_profile().source_status == "USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE"
    r = engine.evaluate(kerc_solar_profile(), 30, 24, 50)
    assert r["rule_source"]["status"] == "USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE"
    assert "not authoritative" in r["explanation"].lower()
