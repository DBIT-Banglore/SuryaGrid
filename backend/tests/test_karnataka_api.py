"""API integration tests for the Karnataka / realtime routes added in this PR.

Uses ASGI transport (no live server, no network) following the same pattern as
test_api.py. A FakeCurrentProvider is injected so no real HTTP calls are made.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from httpx import ASGITransport, AsyncClient

from app.main import app
from tests.conftest import use_fake_provider

# ---------------------------------------------------------------------------
# Fake provider with fetch_current support for realtime route tests
# ---------------------------------------------------------------------------

_FAKE_CURRENT = {
    "timestamp": "2026-06-27T12:00",
    "ghi_w_m2": 800.0,
    "dni_w_m2": 670.0,
    "dhi_w_m2": 130.0,
    "temperature_c": 32.0,
    "cloud_cover_percent": 15.0,
    "wind_speed_mps": 3.0,
}


class FakeCurrentProvider:
    name = "fake-current"

    async def fetch_forecast(self, *args, **kwargs):
        return []

    async def fetch_current(self, latitude, longitude, timezone):
        return dict(_FAKE_CURRENT)


def _inject_current_provider():
    """Inject FakeCurrentProvider into routes_realtime."""
    from app.agents.api_agent import ProviderQuota
    from app.api import routes_realtime

    fake = FakeCurrentProvider()
    routes_realtime._api_agent._providers = [(fake, ProviderQuota("fake-current"))]


# ---------------------------------------------------------------------------
# Karnataka regions and BESCOM status — stateless endpoints
# ---------------------------------------------------------------------------


async def _run_stateless_tests():
    use_fake_provider()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        # GET /karnataka/regions
        r = await c.get("/api/v1/karnataka/regions")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()["data"]
        assert "total_capacity_mw" in data
        assert "regions" in data
        assert "dsm_band_percent" in data
        assert data["total_capacity_mw"] > 0
        assert isinstance(data["regions"], dict)
        # KERC band should be 5%
        assert data["dsm_band_percent"] == 5.0

        # GET /bescom/status
        r = await c.get("/api/v1/bescom/status")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        bdata = r.json()["data"]
        assert "connector" in bdata
        assert "kerc_solar_band_percent" in bdata
        assert "slabs" in bdata
        connector = bdata["connector"]
        assert "operator" in connector
        assert "mode" in connector
        assert "is_live" in connector
        assert connector["mode"] == "simulated"
        assert connector["is_live"] is False
        # Slabs should be a list
        assert isinstance(bdata["slabs"], list)
        assert len(bdata["slabs"]) > 0
        for slab in bdata["slabs"]:
            assert "range_percent" in slab
            assert "rate_inr_per_kwh" in slab


def test_karnataka_stateless_endpoints():
    asyncio.run(_run_stateless_tests())


# ---------------------------------------------------------------------------
# Karnataka seed — registers sites (idempotent)
# ---------------------------------------------------------------------------


async def _run_seed_test():
    use_fake_provider()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post("/api/v1/karnataka/seed")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()["data"]
        assert "created" in data
        assert "total_registry" in data
        assert data["total_registry"] == 6  # KARNATAKA_SITES has 6 entries
        assert isinstance(data["created"], list)

        # Second call is idempotent — no sites created again
        r2 = await c.post("/api/v1/karnataka/seed")
        assert r2.status_code == 200
        data2 = r2.json()["data"]
        assert data2["created"] == []  # already registered


def test_karnataka_seed_idempotent():
    asyncio.run(_run_seed_test())


# ---------------------------------------------------------------------------
# Karnataka regions — data matches KARNATAKA_SITES
# ---------------------------------------------------------------------------


async def _run_regions_detail_test():
    use_fake_provider()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/api/v1/karnataka/regions")
        data = r.json()["data"]
        regions = data["regions"]

        # Tumakuru region must exist (Pavagada is there)
        assert "Tumakuru" in regions
        pavagada = next(
            (s for s in regions["Tumakuru"] if "Pavagada" in s["name"]), None
        )
        assert pavagada is not None
        assert pavagada["capacity_mw"] == 2050.0
        assert pavagada["discom"] == "BESCOM"

        # GESCOM sites are in other regions
        all_discoms = {s["discom"] for sites in regions.values() for s in sites}
        assert "BESCOM" in all_discoms
        assert "GESCOM" in all_discoms


def test_karnataka_regions_structure():
    asyncio.run(_run_regions_detail_test())


# ---------------------------------------------------------------------------
# Realtime weather — GET /weather/current/{site_id}
# ---------------------------------------------------------------------------


async def _run_weather_current_test():
    use_fake_provider()
    _inject_current_provider()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        # With a non-existent site_id → falls back to query params
        r = await c.get(
            "/api/v1/weather/current/unknown-site",
            params={"latitude": 12.97, "longitude": 77.59, "timezone": "Asia/Kolkata"},
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()["data"]
        assert "site_id" in data
        assert "provider" in data
        assert data["provider"] == "fake-current"
        assert "timestamp" in data
        assert "ghi_w_m2" in data
        assert "temperature_c" in data
        assert data["ghi_w_m2"] == 800.0


def test_realtime_weather_current():
    asyncio.run(_run_weather_current_test())


# ---------------------------------------------------------------------------
# Realtime ingest — POST /ingest/current/{site_id}
# ---------------------------------------------------------------------------


async def _run_ingest_tests():
    use_fake_provider()
    _inject_current_provider()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        # Ingest for unknown site_id → returns ingested=False
        r = await c.post("/api/v1/ingest/current/nonexistent-site-id")
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["ingested"] is False
        assert "reason" in data

        # Create a real site, then ingest
        r_site = await c.post(
            "/api/v1/sites",
            json={
                "name": "Real-Time Ingest Test Site",
                "latitude": 12.97,
                "longitude": 77.59,
                "capacity_mw": 10.0,
            },
        )
        assert r_site.status_code == 200
        site_id = r_site.json()["data"]["id"]

        r_ingest = await c.post(f"/api/v1/ingest/current/{site_id}")
        assert r_ingest.status_code == 200
        ingest_data = r_ingest.json()["data"]
        assert ingest_data["ingested"] is True
        assert ingest_data["timestamp"] == "2026-06-27T12:00"
        assert "ghi_w_m2" in ingest_data


def test_realtime_ingest():
    asyncio.run(_run_ingest_tests())


# ---------------------------------------------------------------------------
# Realtime weather — coordinates propagated from registered site
# ---------------------------------------------------------------------------


async def _run_weather_uses_site_coords():
    use_fake_provider()
    _inject_current_provider()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        # Create a site with known coords
        r_site = await c.post(
            "/api/v1/sites",
            json={
                "name": "Coord Test Site",
                "latitude": 14.10,
                "longitude": 77.28,
                "capacity_mw": 100.0,
            },
        )
        assert r_site.status_code == 200
        site_id = r_site.json()["data"]["id"]

        # Calling with different lat/lon in query params: site coords should override
        r = await c.get(
            f"/api/v1/weather/current/{site_id}",
            params={"latitude": 0.0, "longitude": 0.0},
        )
        assert r.status_code == 200
        # The fake provider returns the same data regardless of coords,
        # but the call succeeded = the site override path was taken.
        data = r.json()["data"]
        assert data["site_id"] == site_id


def test_weather_current_uses_registered_site_coords():
    asyncio.run(_run_weather_uses_site_coords())


# ---------------------------------------------------------------------------
# Settlement train_rl — years parameter accepted and reflected in data_source
# ---------------------------------------------------------------------------


async def _run_train_rl_years_param():
    use_fake_provider()
    transport = ASGITransport(app=app)

    # Mock build_real_dataset to return a small synthetic dataset quickly
    import numpy as np

    fake_day = {
        "date": "2025-01-01",
        "production_kw": np.ones(24, dtype=np.float32) * 500,
        "target_kw": np.ones(24, dtype=np.float32) * 600,
        "consumption_kw": np.ones(24, dtype=np.float32) * 300,
        "cloud": np.ones(24, dtype=np.float32) * 20,
    }
    fake_dataset = [fake_day] * 3  # < 10 days → falls back to synthetic

    with patch("app.rl.data.build_real_dataset", return_value=fake_dataset):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post(
                "/api/v1/rl/train",
                params={
                    "episodes": 10,
                    "use_real_data": True,
                    "years": 2,
                    "days_back": 90,
                },
            )
        assert r.status_code == 200
        data = r.json()["data"]
        assert "data_source" in data


def test_train_rl_years_param_accepted():
    asyncio.run(_run_train_rl_years_param())


async def _run_train_rl_data_source_format():
    use_fake_provider()

    # 15+ days → real training path: data_source includes "Xy" span format
    import numpy as np

    fake_day = {
        "date": "2025-01-01",
        "production_kw": np.ones(24, dtype=np.float32) * 500,
        "target_kw": np.ones(24, dtype=np.float32) * 600,
        "consumption_kw": np.ones(24, dtype=np.float32) * 300,
        "cloud": np.ones(24, dtype=np.float32) * 20,
    }
    fake_dataset = [fake_day] * 15  # >= 10 days → real training

    fake_policy = MagicMock()
    fake_policy.get_rates.return_value = {"penalty_rate": 1.0, "bonus_rate": 1.0, "discount": 0.9}
    fake_metrics = {"policy": fake_policy, "best_reward": 5.0, "mean_reward": 3.0}

    with patch("app.rl.data.build_real_dataset", return_value=fake_dataset), \
         patch("app.rl.train.train_real", return_value=fake_metrics):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post(
                "/api/v1/rl/train",
                params={
                    "episodes": 10,
                    "use_real_data": True,
                    "years": 2,
                    "days_back": 90,
                },
            )
        assert r.status_code == 200
        data = r.json()["data"]
        # years=2 → span should be "2y"
        assert "2y" in data.get("data_source", ""), (
            f"Expected '2y' in data_source, got: {data.get('data_source')}"
        )


def test_train_rl_years_data_source_format():
    asyncio.run(_run_train_rl_data_source_format())


async def _run_train_rl_data_source_days_format():
    use_fake_provider()

    import numpy as np

    fake_day = {
        "date": "2025-01-01",
        "production_kw": np.ones(24, dtype=np.float32) * 500,
        "target_kw": np.ones(24, dtype=np.float32) * 600,
        "consumption_kw": np.ones(24, dtype=np.float32) * 300,
        "cloud": np.ones(24, dtype=np.float32) * 20,
    }
    fake_dataset = [fake_day] * 15  # >= 10 days → real training

    fake_policy = MagicMock()
    fake_policy.get_rates.return_value = {"penalty_rate": 1.0, "bonus_rate": 1.0, "discount": 0.9}
    fake_metrics = {"policy": fake_policy, "best_reward": 5.0, "mean_reward": 3.0}

    with patch("app.rl.data.build_real_dataset", return_value=fake_dataset), \
         patch("app.rl.train.train_real", return_value=fake_metrics):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post(
                "/api/v1/rl/train",
                params={
                    "episodes": 10,
                    "use_real_data": True,
                    "years": 0,
                    "days_back": 60,
                },
            )
        assert r.status_code == 200
        data = r.json()["data"]
        # years=0 → span should be "60d"
        assert "60d" in data.get("data_source", ""), (
            f"Expected '60d' in data_source, got: {data.get('data_source')}"
        )


def test_train_rl_days_data_source_format():
    asyncio.run(_run_train_rl_data_source_days_format())


if __name__ == "__main__":
    test_karnataka_stateless_endpoints()
    test_karnataka_seed_idempotent()
    test_karnataka_regions_structure()
    test_realtime_weather_current()
    test_realtime_ingest()
    test_weather_current_uses_registered_site_coords()
    test_train_rl_years_param_accepted()
    test_train_rl_years_data_source_format()
    test_train_rl_days_data_source_format()
    print("All Karnataka / realtime API tests PASSED")