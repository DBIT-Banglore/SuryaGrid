"""Tests for the NREL NSRDB provider (SRC-NSRDB-001).

The network endpoint is NOT hit in tests - these verify the honest failure
modes (missing key), the PSM3 CSV parsing contract, and registry integration.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.data_sources.nsrdb_provider import NSRDBDataSource  # noqa: E402
from app.data_sources.source_registry import get_source  # noqa: E402
from app.providers.nsrdb import (  # noqa: E402
    NSRDBKeyMissingError,
    NSRDBProvider,
    _parse_psm3_csv,
)

_PSM3_SAMPLE = (
    # Real layout: row0 site metadata, row1 units, row2 field names, row3+ data
    "NSRDB,160094,-,Karnataka,India,12.98,77.59,5,931\n"
    "w/m2,w/m2,w/m2,c,m/s,mbar\n"
    "Year,Month,Day,Hour,Minute,GHI,DNI,DHI,Temperature,Wind Speed,Pressure\n"
    "2022,1,1,0,0,-999,-999,-999,24.1,3.2,1013.0\n"
    "2022,1,1,1,0,0,0,0,23.8,3.0,1013.1\n"
    "2022,1,1,12,0,850.5,760.2,120.4,31.5,4.1,1009.6\n"
)


def test_missing_key_raises_not_available() -> None:
    provider = NSRDBProvider(api_key=None)
    with pytest.raises(NSRDBKeyMissingError):
        # Key check happens before any I/O or dataset-year validation
        import asyncio

        asyncio.run(provider.fetch_year(12.97, 77.59, 2019))


def test_year_outside_india_datasets_is_rejected() -> None:
    provider = NSRDBProvider(api_key="k")
    import asyncio

    from app.providers.nsrdb import ProviderError

    with pytest.raises(ProviderError, match="outside the India datasets"):
        asyncio.run(provider.fetch_year(12.97, 77.59, 2022))


@pytest.mark.asyncio
async def test_forecast_interface_is_refused() -> None:
    provider = NSRDBProvider(api_key="k")
    with pytest.raises(NotImplementedError):
        await provider.fetch_forecast(12.97, 77.59, "Asia/Kolkata")


def test_parse_psm3_csv() -> None:
    points = _parse_psm3_csv(_PSM3_SAMPLE)
    assert len(points) == 3
    night, midnight, noon = points
    # -999 fill values become 0, never negative irradiance
    assert night.ghi_w_m2 == 0.0 and night.dni_w_m2 == 0.0
    assert midnight.timestamp.hour == 1 and midnight.ghi_w_m2 == 0.0
    assert noon.ghi_w_m2 == 850.5
    assert noon.dni_w_m2 == 760.2 and noon.dhi_w_m2 == 120.4
    assert noon.temperature_c == 31.5
    assert abs(noon.pressure_hpa - 1009.6) < 1e-9


def test_parse_rejects_empty_response() -> None:
    from app.providers.nsrdb import ProviderError

    with pytest.raises(ProviderError):
        _parse_psm3_csv("")


def test_registry_record_verified() -> None:
    rec = get_source("SRC-NSRDB-001")
    assert rec is not None
    assert rec.type == "weather"
    # Live-verified 2026-08-26: real Bengaluru year downloaded via developer.nlr.gov
    # (lab renamed NREL->NLR; nrel.gov NXDOMAINs).
    assert rec.verified == "verified"
    assert "nlr.gov" in rec.url


def test_status_contract_reflects_key_state(monkeypatch) -> None:
    from app.config import get_settings

    # get_settings() is lru_cache'd -> patch the cached instance's attribute
    settings = get_settings()
    monkeypatch.setattr(settings, "NREL_API_KEY", "", raising=False)
    st_off = NSRDBDataSource().status()
    assert st_off.mode == "real"
    assert st_off.loaded is False
    assert "NREL_API_KEY" in st_off.detail

    monkeypatch.setattr(settings, "NREL_API_KEY", "test-key", raising=False)
    st_on = NSRDBDataSource().status()
    assert st_on.loaded is True
    assert st_on.extra["supports_forecast"] is False
