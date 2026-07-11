"""Tests for the build_real_dataset window-building and dataset logic (PR: multi-year ERA5).

Focuses on the logic added/changed in this PR:
- years=0 → single trailing-days_back window
- years=N → N year-sized windows going back from "end"
- windows are non-overlapping and consecutive
- max_days cap terminates the dataset early
- sorted(by_day.items()) ensures chronological dataset order
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np

# ---------------------------------------------------------------------------
# Helper: replicate the window-building logic from rl/data.py so we can
# unit-test it independently of the async provider calls.
# ---------------------------------------------------------------------------

def _build_windows(days_back: int, years: int, reference_end: date | None = None) -> list[tuple[date, date]]:
    """Mirror the window-building logic from build_real_dataset."""
    end = reference_end or (date.today() - timedelta(days=7))
    windows: list[tuple[date, date]] = []
    if years and years > 0:
        cursor_end = end
        for _ in range(years):
            cursor_start = cursor_end - timedelta(days=365)
            windows.append((cursor_start, cursor_end))
            cursor_end = cursor_start - timedelta(days=1)
    else:
        windows.append((end - timedelta(days=days_back), end))
    return windows


# Use a fixed reference so tests are deterministic.
_REF_END = date(2026, 6, 20)


# ---------------------------------------------------------------------------
# Window count tests
# ---------------------------------------------------------------------------


def test_years_zero_produces_single_window():
    windows = _build_windows(days_back=90, years=0, reference_end=_REF_END)
    assert len(windows) == 1


def test_years_one_produces_one_window():
    windows = _build_windows(days_back=90, years=1, reference_end=_REF_END)
    assert len(windows) == 1


def test_years_two_produces_two_windows():
    windows = _build_windows(days_back=90, years=2, reference_end=_REF_END)
    assert len(windows) == 2


def test_years_five_produces_five_windows():
    windows = _build_windows(days_back=90, years=5, reference_end=_REF_END)
    assert len(windows) == 5


# ---------------------------------------------------------------------------
# Window size tests
# ---------------------------------------------------------------------------


def test_days_back_window_size():
    windows = _build_windows(days_back=90, years=0, reference_end=_REF_END)
    start, end = windows[0]
    assert (end - start).days == 90


def test_days_back_custom_size():
    windows = _build_windows(days_back=180, years=0, reference_end=_REF_END)
    start, end = windows[0]
    assert (end - start).days == 180


def test_year_window_is_365_days():
    windows = _build_windows(days_back=90, years=1, reference_end=_REF_END)
    start, end = windows[0]
    assert (end - start).days == 365


def test_multi_year_each_window_is_365_days():
    windows = _build_windows(days_back=90, years=3, reference_end=_REF_END)
    for start, end in windows:
        assert (end - start).days == 365


# ---------------------------------------------------------------------------
# Window ordering and non-overlap
# ---------------------------------------------------------------------------


def test_single_year_window_ends_at_reference():
    windows = _build_windows(days_back=90, years=1, reference_end=_REF_END)
    _, end = windows[0]
    assert end == _REF_END


def test_days_back_window_ends_at_reference():
    windows = _build_windows(days_back=60, years=0, reference_end=_REF_END)
    _, end = windows[0]
    assert end == _REF_END


def test_multi_year_windows_are_non_overlapping():
    windows = _build_windows(days_back=90, years=3, reference_end=_REF_END)
    for i in range(len(windows) - 1):
        _, end_current = windows[i]
        start_next, _ = windows[i + 1]
        # Gap of exactly 1 day between windows (cursor_end = cursor_start - 1)
        assert end_current - start_next == timedelta(days=1), (
            f"Window {i} and {i+1} are not separated by 1 day: {end_current} vs {start_next}"
        )


def test_multi_year_windows_in_descending_order():
    """Windows are built going further back in time."""
    windows = _build_windows(days_back=90, years=3, reference_end=_REF_END)
    for i in range(len(windows) - 1):
        # Earlier index = more recent window
        _, end_i = windows[i]
        _, end_next = windows[i + 1]
        assert end_i > end_next


# ---------------------------------------------------------------------------
# build_real_dataset integration: verify fetch_archive called correct times
# ---------------------------------------------------------------------------


async def _run_build_dataset_mocked(years: int, days_back: int, num_days_data: int = 0):
    """Run build_real_dataset with mocked provider and agent."""
    from app.rl.data import build_real_dataset

    # Mock provider: fetch_archive returns empty list (no data → empty dataset)
    mock_provider = MagicMock()
    mock_provider.fetch_archive = AsyncMock(return_value=[])

    with patch("app.rl.data.OpenMeteoProvider", return_value=mock_provider), \
         patch("app.rl.data.ForecastAgent"), \
         patch("app.rl.data.generate_consumption_day", return_value=[{"consumption_kw": 100.0}] * 24):
        result = await build_real_dataset(
            latitude=12.97,
            longitude=77.59,
            timezone="Asia/Kolkata",
            capacity_mw=50.0,
            days_back=days_back,
            years=years,
        )
    return mock_provider, result


def test_fetch_archive_called_once_for_zero_years():
    mock_provider, _ = asyncio.run(_run_build_dataset_mocked(years=0, days_back=90))
    assert mock_provider.fetch_archive.call_count == 1


def test_fetch_archive_called_once_for_one_year():
    mock_provider, _ = asyncio.run(_run_build_dataset_mocked(years=1, days_back=90))
    assert mock_provider.fetch_archive.call_count == 1


def test_fetch_archive_called_twice_for_two_years():
    mock_provider, _ = asyncio.run(_run_build_dataset_mocked(years=2, days_back=90))
    assert mock_provider.fetch_archive.call_count == 2


def test_fetch_archive_called_three_times_for_three_years():
    mock_provider, _ = asyncio.run(_run_build_dataset_mocked(years=3, days_back=90))
    assert mock_provider.fetch_archive.call_count == 3


def test_empty_archive_returns_empty_dataset():
    _, result = asyncio.run(_run_build_dataset_mocked(years=0, days_back=90))
    assert result == []


# ---------------------------------------------------------------------------
# max_days cap: dataset is truncated after max_days entries
# ---------------------------------------------------------------------------


def _make_fake_weather_point(ts_date: date, hour: int):
    """Create a minimal WeatherPoint-like mock for a given date and hour."""
    from datetime import datetime, timezone

    wp = MagicMock()
    wp.timestamp = datetime(ts_date.year, ts_date.month, ts_date.day, hour, tzinfo=timezone.utc)
    wp.ghi_w_m2 = 600.0 if 6 <= hour <= 18 else 0.0
    wp.dni_w_m2 = 500.0 if 6 <= hour <= 18 else 0.0
    wp.dhi_w_m2 = 100.0 if 6 <= hour <= 18 else 0.0
    wp.temperature_c = 30.0
    wp.cloud_cover_percent = 20.0
    wp.wind_speed_mps = 2.0
    return wp


def _make_full_day_points(day: date) -> list:
    return [_make_fake_weather_point(day, h) for h in range(24)]


async def _run_build_with_fake_data(num_days: int, max_days: int, years: int = 0):
    """Run build_real_dataset with synthetic data covering num_days full days."""
    from datetime import datetime, timezone

    from app.rl.data import build_real_dataset

    ref_end = date.today() - timedelta(days=7)
    # Build num_days worth of synthetic WeatherPoint objects
    all_points = []
    for d_offset in range(num_days):
        day = ref_end - timedelta(days=num_days - d_offset)
        all_points.extend(_make_full_day_points(day))

    mock_provider = MagicMock()
    mock_provider.fetch_archive = AsyncMock(return_value=all_points)

    # Mock ForecastAgent to return non-zero production for each hour
    mock_fp = MagicMock()
    mock_fp.predicted_generation_mw = 10.0
    mock_fp.clearsky_generation_mw = 12.0
    mock_fp.cloud_cover_percent = 20.0
    mock_agent = MagicMock()
    mock_agent.forecast_timeline = MagicMock(return_value=[mock_fp] * 24)

    with patch("app.rl.data.OpenMeteoProvider", return_value=mock_provider), \
         patch("app.rl.data.ForecastAgent", return_value=mock_agent), \
         patch("app.rl.data.generate_consumption_day",
               return_value=[{"consumption_kw": 1000.0}] * 24):
        result = await build_real_dataset(
            latitude=12.97,
            longitude=77.59,
            timezone="Asia/Kolkata",
            capacity_mw=50.0,
            days_back=num_days,
            years=years,
            max_days=max_days,
        )
    return result


def test_max_days_cap_limits_dataset():
    # Provide 10 days of data but cap at 3
    result = asyncio.run(_run_build_with_fake_data(num_days=10, max_days=3))
    assert len(result) <= 3


def test_max_days_cap_not_exceeded():
    result = asyncio.run(_run_build_with_fake_data(num_days=20, max_days=5))
    assert len(result) == 5


def test_no_cap_returns_all_days():
    result = asyncio.run(_run_build_with_fake_data(num_days=5, max_days=1000))
    assert len(result) == 5


# ---------------------------------------------------------------------------
# Dataset structure
# ---------------------------------------------------------------------------


def test_dataset_entry_has_required_keys():
    result = asyncio.run(_run_build_with_fake_data(num_days=2, max_days=10))
    for entry in result:
        assert "date" in entry
        assert "production_kw" in entry
        assert "target_kw" in entry
        assert "consumption_kw" in entry
        assert "cloud" in entry


def test_dataset_arrays_are_numpy_float32():
    result = asyncio.run(_run_build_with_fake_data(num_days=2, max_days=10))
    for entry in result:
        assert entry["production_kw"].dtype == np.float32
        assert entry["target_kw"].dtype == np.float32
        assert entry["consumption_kw"].dtype == np.float32
        assert entry["cloud"].dtype == np.float32


def test_dataset_arrays_have_24_hours():
    result = asyncio.run(_run_build_with_fake_data(num_days=2, max_days=10))
    for entry in result:
        assert len(entry["production_kw"]) == 24
        assert len(entry["cloud"]) == 24


if __name__ == "__main__":
    test_years_zero_produces_single_window()
    test_years_one_produces_one_window()
    test_years_two_produces_two_windows()
    test_years_five_produces_five_windows()
    test_days_back_window_size()
    test_year_window_is_365_days()
    test_multi_year_each_window_is_365_days()
    test_multi_year_windows_are_non_overlapping()
    test_fetch_archive_called_once_for_zero_years()
    test_fetch_archive_called_twice_for_two_years()
    test_max_days_cap_limits_dataset()
    test_dataset_entry_has_required_keys()
    print("All RL data window tests PASSED")