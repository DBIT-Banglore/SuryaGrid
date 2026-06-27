"""Tests for the KERC/BESCOM Karnataka DSM engine and connector."""

import pytest

from app.integrations.bescom import BescomConnector, FeedMode, TelemetryPoint
from app.integrations.karnataka_dsm import (
    DEFAULT_SLABS,
    KERC_SOLAR_BAND_PERCENT,
    KarnatakaDSM,
    KarnatakaDSMResult,
)

dsm = KarnatakaDSM()


def test_default_band_is_kerc_five_percent():
    assert dsm.band_percent == 5.0
    assert KERC_SOLAR_BAND_PERCENT == 5.0


def test_within_band_no_charge():
    # 3% deviation on a 100 MW plant → within ±5% band → no charge
    r = dsm.settle(actual_mw=97.0, scheduled_mw=100.0, available_capacity_mw=100.0)
    assert r.within_band is True
    assert r.dsm_charge_inr == 0.0
    assert r.direction == "under-injection"


def test_breach_incurs_slab_charge():
    # 20% under-injection → beyond band → slab charges apply
    r = dsm.settle(actual_mw=80.0, scheduled_mw=100.0, available_capacity_mw=100.0)
    assert r.within_band is False
    assert r.dsm_charge_inr > 0
    assert len(r.slab_breakdown) >= 1


def test_over_injection_direction():
    r = dsm.settle(actual_mw=112.0, scheduled_mw=100.0, available_capacity_mw=100.0)
    assert r.direction == "over-injection"
    assert r.within_band is False


def test_bescom_connector_simulated():
    conn = BescomConnector()
    assert conn.mode == FeedMode.SIMULATED
    assert conn.is_live is False
    point = conn.actual_injection(nowcast_mw=42.0, timestamp="2026-06-27T12:00")
    assert point.actual_injection_mw == 42.0
    assert "simulated" in point.source
    assert conn.status()["is_live"] is False


# ---------------------------------------------------------------------------
# KarnatakaDSM — boundary and slab precision tests
# ---------------------------------------------------------------------------


def test_exactly_at_band_boundary_within():
    # Exactly 5.0% deviation on a 100 MW plant → should be within band (<=)
    r = dsm.settle(actual_mw=95.0, scheduled_mw=100.0, available_capacity_mw=100.0)
    assert r.within_band is True
    assert r.dsm_charge_inr == 0.0
    assert r.deviation_percent == 5.0


def test_just_beyond_band_incurs_charge():
    # 5.5% deviation → just outside 5% band → first slab applies
    r = dsm.settle(actual_mw=94.5, scheduled_mw=100.0, available_capacity_mw=100.0)
    assert r.within_band is False
    assert r.dsm_charge_inr > 0.0
    assert len(r.slab_breakdown) == 1


def test_zero_deviation_is_balanced():
    r = dsm.settle(actual_mw=50.0, scheduled_mw=50.0, available_capacity_mw=100.0)
    assert r.direction == "balanced"
    assert r.within_band is True
    assert r.dsm_charge_inr == 0.0
    assert r.deviation_mw == 0.0


def test_slab_1_only_seven_percent_deviation():
    # 7% deviation: beyond 5% band, within first slab (5-10%)
    # cap=100, deviation_pct=7, band=5 → 2% chargeable in slab1 at rate 2.0 INR/kWh
    # energy = (2/100) * 100 * 0.25 (default interval) = 0.5 MWh
    # charge = 0.5 * 2.0 * 1000 = 1000 INR
    r = dsm.settle(actual_mw=93.0, scheduled_mw=100.0, available_capacity_mw=100.0)
    assert r.within_band is False
    assert len(r.slab_breakdown) == 1
    assert r.slab_breakdown[0]["rate_inr_per_kwh"] == 2.0
    assert abs(r.dsm_charge_inr - 1000.0) < 1.0  # within 1 INR rounding


def test_two_slabs_for_twelve_percent_deviation():
    # 12% deviation: spans slab1 (5-10%) and slab2 (10-12%)
    r = dsm.settle(actual_mw=88.0, scheduled_mw=100.0, available_capacity_mw=100.0)
    assert r.within_band is False
    assert len(r.slab_breakdown) == 2
    rates = {sb["rate_inr_per_kwh"] for sb in r.slab_breakdown}
    assert 2.0 in rates  # slab1
    assert 4.0 in rates  # slab2


def test_all_three_slabs_for_large_deviation():
    # 20% deviation: spans all 3 slabs (5-10, 10-15, 15-20)
    r = dsm.settle(actual_mw=80.0, scheduled_mw=100.0, available_capacity_mw=100.0)
    assert len(r.slab_breakdown) == 3
    rates = [sb["rate_inr_per_kwh"] for sb in r.slab_breakdown]
    assert 2.0 in rates
    assert 4.0 in rates
    assert 6.0 in rates


def test_interval_hours_scales_charge():
    # 1-hour interval should give 4× the charge of 0.25-hour (default)
    r_15min = dsm.settle(actual_mw=80.0, scheduled_mw=100.0, available_capacity_mw=100.0, interval_hours=0.25)
    r_1hr = dsm.settle(actual_mw=80.0, scheduled_mw=100.0, available_capacity_mw=100.0, interval_hours=1.0)
    assert abs(r_1hr.dsm_charge_inr - r_15min.dsm_charge_inr * 4.0) < 0.1


def test_deviation_percent_uses_available_capacity_not_scheduled():
    # actual=10, scheduled=0, cap=100 → deviation_mw=10, deviation_pct=10%
    r = dsm.settle(actual_mw=10.0, scheduled_mw=0.0, available_capacity_mw=100.0)
    assert r.deviation_percent == 10.0
    assert r.direction == "over-injection"


def test_custom_band_percent_and_slabs():
    custom = KarnatakaDSM(band_percent=10.0, slabs=[(10.0, 100.0, 3.0)])
    # 8% deviation → within 10% band → no charge
    r = custom.settle(actual_mw=92.0, scheduled_mw=100.0, available_capacity_mw=100.0)
    assert r.within_band is True
    assert r.dsm_charge_inr == 0.0
    # 15% deviation → beyond 10% band → 1 slab
    r2 = custom.settle(actual_mw=85.0, scheduled_mw=100.0, available_capacity_mw=100.0)
    assert r2.within_band is False
    assert len(r2.slab_breakdown) == 1
    assert r2.slab_breakdown[0]["rate_inr_per_kwh"] == 3.0


def test_result_is_karnataka_dsm_result_dataclass():
    r = dsm.settle(actual_mw=50.0, scheduled_mw=50.0, available_capacity_mw=100.0)
    assert isinstance(r, KarnatakaDSMResult)
    assert r.band_percent == 5.0
    assert r.available_capacity_mw == 100.0


def test_slab_breakdown_entry_has_required_keys():
    # 10% deviation → 1 slab entry
    r = dsm.settle(actual_mw=90.0, scheduled_mw=100.0, available_capacity_mw=100.0)
    assert r.within_band is False
    for entry in r.slab_breakdown:
        assert "slab_percent" in entry
        assert "rate_inr_per_kwh" in entry
        assert "energy_mwh" in entry
        assert "charge_inr" in entry


def test_zero_available_capacity_guard():
    # available_capacity_mw=0 → uses 1e-9 guard, should not raise ZeroDivisionError
    r = dsm.settle(actual_mw=5.0, scheduled_mw=5.0, available_capacity_mw=0.0)
    assert r.within_band is True  # deviation_mw=0 → within any band


def test_default_slabs_structure():
    assert len(DEFAULT_SLABS) == 3
    # Escalating rates
    rates = [rate for _, _, rate in DEFAULT_SLABS]
    assert rates == sorted(rates)  # rates must be strictly increasing
    # Band starts at 5%
    assert DEFAULT_SLABS[0][0] == 5.0


def test_large_over_injection_charge():
    # 50% over-injection → all slabs (5-10, 10-15, 15-50)
    r = dsm.settle(actual_mw=150.0, scheduled_mw=100.0, available_capacity_mw=100.0)
    assert r.direction == "over-injection"
    assert r.within_band is False
    assert r.dsm_charge_inr > 0
    assert r.deviation_percent == 50.0


# ---------------------------------------------------------------------------
# BescomConnector — mode, live status, error handling
# ---------------------------------------------------------------------------


def test_bescom_scada_mode_is_live():
    conn = BescomConnector(mode=FeedMode.SCADA)
    assert conn.mode == FeedMode.SCADA
    assert conn.is_live is True


def test_bescom_file_mode_is_live():
    conn = BescomConnector(mode=FeedMode.FILE)
    assert conn.mode == FeedMode.FILE
    assert conn.is_live is True


def test_bescom_simulated_mode_not_live():
    conn = BescomConnector(mode=FeedMode.SIMULATED)
    assert conn.is_live is False


def test_bescom_scada_actual_injection_raises():
    conn = BescomConnector(mode=FeedMode.SCADA)
    with pytest.raises(NotImplementedError):
        conn.actual_injection(nowcast_mw=10.0, timestamp="2026-06-27T12:00")


def test_bescom_file_actual_injection_raises():
    conn = BescomConnector(mode=FeedMode.FILE)
    with pytest.raises(NotImplementedError):
        conn.actual_injection(nowcast_mw=10.0, timestamp="2026-06-27T12:00")


def test_bescom_status_dict_has_all_keys():
    conn = BescomConnector()
    s = conn.status()
    assert "operator" in s
    assert "mode" in s
    assert "is_live" in s
    assert "note" in s


def test_bescom_status_mode_reflects_feedmode():
    for mode in FeedMode:
        conn = BescomConnector(mode=mode)
        assert conn.status()["mode"] == mode.value


def test_bescom_status_operator_name():
    conn = BescomConnector()
    assert "BESCOM" in conn.status()["operator"]
    assert "Karnataka" in conn.status()["operator"]


def test_telemetry_point_preserves_timestamp():
    conn = BescomConnector()
    ts = "2026-06-27T08:30"
    point = conn.actual_injection(nowcast_mw=75.5, timestamp=ts)
    assert isinstance(point, TelemetryPoint)
    assert point.timestamp == ts
    assert point.actual_injection_mw == 75.5
    assert point.source == "simulated:nowcast"


def test_telemetry_point_zero_injection():
    conn = BescomConnector()
    point = conn.actual_injection(nowcast_mw=0.0, timestamp="2026-06-27T00:00")
    assert point.actual_injection_mw == 0.0


def test_feedmode_values():
    assert FeedMode.SIMULATED == "simulated"
    assert FeedMode.SCADA == "scada"
    assert FeedMode.FILE == "file"


if __name__ == "__main__":
    test_default_band_is_kerc_five_percent()
    test_within_band_no_charge()
    test_breach_incurs_slab_charge()
    test_over_injection_direction()
    test_bescom_connector_simulated()
    test_exactly_at_band_boundary_within()
    test_just_beyond_band_incurs_charge()
    test_zero_deviation_is_balanced()
    test_slab_1_only_seven_percent_deviation()
    test_two_slabs_for_twelve_percent_deviation()
    test_all_three_slabs_for_large_deviation()
    test_interval_hours_scales_charge()
    test_deviation_percent_uses_available_capacity_not_scheduled()
    test_custom_band_percent_and_slabs()
    test_result_is_karnataka_dsm_result_dataclass()
    test_slab_breakdown_entry_has_required_keys()
    test_zero_available_capacity_guard()
    test_default_slabs_structure()
    test_large_over_injection_charge()
    test_bescom_scada_mode_is_live()
    test_bescom_file_mode_is_live()
    test_bescom_simulated_mode_not_live()
    test_bescom_scada_actual_injection_raises()
    test_bescom_file_actual_injection_raises()
    test_bescom_status_dict_has_all_keys()
    test_bescom_status_mode_reflects_feedmode()
    test_bescom_status_operator_name()
    test_telemetry_point_preserves_timestamp()
    test_telemetry_point_zero_injection()
    test_feedmode_values()
    print("All Karnataka DSM tests PASSED")
