"""Tests for the OpenMeteoProvider.fetch_current() method added in this PR."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.providers.open_meteo import OpenMeteoProvider, ProviderError

_PROVIDER = OpenMeteoProvider(timeout_seconds=10.0)

_SAMPLE_CURRENT_PAYLOAD = {
    "latitude": 12.97,
    "longitude": 77.59,
    "utc_offset_seconds": 19800,
    "current": {
        "time": "2026-06-27T12:00",
        "interval": 900,
        "temperature_2m": 32.5,
        "cloud_cover": 15.0,
        "shortwave_radiation": 850.0,
        "direct_normal_irradiance": 720.0,
        "diffuse_radiation": 130.0,
        "wind_speed_10m": 3.2,
    },
}


def _make_mock_response(payload: dict, status_code: int = 200):
    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    mock_resp.json.return_value = payload
    if status_code >= 400:
        mock_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            message="error", request=MagicMock(), response=mock_resp
        )
    else:
        mock_resp.raise_for_status.return_value = None
    return mock_resp


def _mock_client(payload: dict, status_code: int = 200):
    """Return a context manager that yields a mock client returning the given payload."""
    mock_resp = _make_mock_response(payload, status_code)
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    ctx = AsyncMock()
    ctx.__aenter__ = AsyncMock(return_value=mock_client)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx


async def _fetch(latitude=12.97, longitude=77.59, timezone="Asia/Kolkata"):
    return await _PROVIDER.fetch_current(latitude=latitude, longitude=longitude, timezone=timezone)


# ---------------------------------------------------------------------------
# Happy-path tests
# ---------------------------------------------------------------------------


def test_fetch_current_returns_all_expected_keys():
    with patch("httpx.AsyncClient", return_value=_mock_client(_SAMPLE_CURRENT_PAYLOAD)):
        result = asyncio.run(_fetch())
    expected_keys = {
        "timestamp", "ghi_w_m2", "dni_w_m2", "dhi_w_m2",
        "temperature_c", "cloud_cover_percent", "wind_speed_mps",
    }
    assert expected_keys == set(result.keys())


def test_fetch_current_maps_ghi_correctly():
    with patch("httpx.AsyncClient", return_value=_mock_client(_SAMPLE_CURRENT_PAYLOAD)):
        result = asyncio.run(_fetch())
    assert result["ghi_w_m2"] == 850.0


def test_fetch_current_maps_dni_correctly():
    with patch("httpx.AsyncClient", return_value=_mock_client(_SAMPLE_CURRENT_PAYLOAD)):
        result = asyncio.run(_fetch())
    assert result["dni_w_m2"] == 720.0


def test_fetch_current_maps_dhi_correctly():
    with patch("httpx.AsyncClient", return_value=_mock_client(_SAMPLE_CURRENT_PAYLOAD)):
        result = asyncio.run(_fetch())
    assert result["dhi_w_m2"] == 130.0


def test_fetch_current_maps_temperature_correctly():
    with patch("httpx.AsyncClient", return_value=_mock_client(_SAMPLE_CURRENT_PAYLOAD)):
        result = asyncio.run(_fetch())
    assert result["temperature_c"] == 32.5


def test_fetch_current_maps_cloud_cover_correctly():
    with patch("httpx.AsyncClient", return_value=_mock_client(_SAMPLE_CURRENT_PAYLOAD)):
        result = asyncio.run(_fetch())
    assert result["cloud_cover_percent"] == 15.0


def test_fetch_current_maps_wind_speed_correctly():
    with patch("httpx.AsyncClient", return_value=_mock_client(_SAMPLE_CURRENT_PAYLOAD)):
        result = asyncio.run(_fetch())
    assert result["wind_speed_mps"] == 3.2


def test_fetch_current_maps_timestamp_correctly():
    with patch("httpx.AsyncClient", return_value=_mock_client(_SAMPLE_CURRENT_PAYLOAD)):
        result = asyncio.run(_fetch())
    assert result["timestamp"] == "2026-06-27T12:00"


# ---------------------------------------------------------------------------
# None / missing field handling via _f() helper
# ---------------------------------------------------------------------------


def test_fetch_current_none_values_become_zero():
    """All None fields in the payload must map to 0.0 via the _f() helper."""
    payload = {
        "current": {
            "time": "2026-06-27T12:00",
            "temperature_2m": None,
            "cloud_cover": None,
            "shortwave_radiation": None,
            "direct_normal_irradiance": None,
            "diffuse_radiation": None,
            "wind_speed_10m": None,
        }
    }
    with patch("httpx.AsyncClient", return_value=_mock_client(payload)):
        result = asyncio.run(_fetch())
    assert result["ghi_w_m2"] == 0.0
    assert result["dni_w_m2"] == 0.0
    assert result["dhi_w_m2"] == 0.0
    assert result["temperature_c"] == 0.0
    assert result["cloud_cover_percent"] == 0.0
    assert result["wind_speed_mps"] == 0.0


def test_fetch_current_missing_current_block_returns_zeros():
    """If the 'current' key is absent, all numeric fields should be 0.0."""
    payload: dict = {}  # no "current" key
    with patch("httpx.AsyncClient", return_value=_mock_client(payload)):
        result = asyncio.run(_fetch())
    assert result["timestamp"] is None
    assert result["ghi_w_m2"] == 0.0
    assert result["wind_speed_mps"] == 0.0


def test_fetch_current_partial_fields_fill_zeros():
    """Partial current block → missing fields fall back to 0.0."""
    payload = {
        "current": {
            "time": "2026-06-27T06:00",
            "shortwave_radiation": 100.0,
            # all other fields missing
        }
    }
    with patch("httpx.AsyncClient", return_value=_mock_client(payload)):
        result = asyncio.run(_fetch())
    assert result["ghi_w_m2"] == 100.0
    assert result["temperature_c"] == 0.0
    assert result["cloud_cover_percent"] == 0.0


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


def test_fetch_current_raises_provider_error_on_http_error():
    """HTTPError from httpx must be re-raised as ProviderError."""
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(
        side_effect=httpx.ConnectError("connection refused")
    )
    ctx = AsyncMock()
    ctx.__aenter__ = AsyncMock(return_value=mock_client)
    ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("httpx.AsyncClient", return_value=ctx):
        with pytest.raises(ProviderError):
            asyncio.run(_fetch())


def test_fetch_current_raises_provider_error_on_http_status_error():
    """Non-2xx HTTP response must result in ProviderError."""
    with patch("httpx.AsyncClient", return_value=_mock_client({}, status_code=503)):
        with pytest.raises(ProviderError):
            asyncio.run(_fetch())


def test_fetch_current_raises_provider_error_on_404():
    with patch("httpx.AsyncClient", return_value=_mock_client({}, status_code=404)):
        with pytest.raises(ProviderError):
            asyncio.run(_fetch())


# ---------------------------------------------------------------------------
# Regression: nighttime readings (all irradiance zero) still return valid dict
# ---------------------------------------------------------------------------


def test_fetch_current_nighttime_all_irradiance_zero():
    payload = {
        "current": {
            "time": "2026-06-27T02:00",
            "temperature_2m": 26.0,
            "cloud_cover": 80.0,
            "shortwave_radiation": 0.0,
            "direct_normal_irradiance": 0.0,
            "diffuse_radiation": 0.0,
            "wind_speed_10m": 1.5,
        }
    }
    with patch("httpx.AsyncClient", return_value=_mock_client(payload)):
        result = asyncio.run(_fetch())
    assert result["ghi_w_m2"] == 0.0
    assert result["temperature_c"] == 26.0
    assert result["timestamp"] == "2026-06-27T02:00"


if __name__ == "__main__":
    print("Running Open-Meteo fetch_current tests...")
    test_fetch_current_returns_all_expected_keys()
    test_fetch_current_maps_ghi_correctly()
    test_fetch_current_maps_timestamp_correctly()
    test_fetch_current_none_values_become_zero()
    test_fetch_current_missing_current_block_returns_zeros()
    test_fetch_current_partial_fields_fill_zeros()
    test_fetch_current_nighttime_all_irradiance_zero()
    print("All Open-Meteo fetch_current tests PASSED")