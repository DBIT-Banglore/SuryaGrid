"""NLR NSRDB data-source wrapper - real historical satellite irradiance.

Adds the DataProvider status contract on top of app/providers/nsrdb.py. The
status is honest about its two gates: a developer key must be configured, and
the product is historical-only (it never serves live forecasts - that stays
with Open-Meteo). Note: the laboratory was renamed NREL -> NLR and its domain
moved from nrel.gov to nlr.gov (verified 2026-08-26).

SOURCE: docs/SOURCE_REGISTRY.md#src-nsrdb-001 (SRC-NSRDB-001)
"""

from __future__ import annotations

from app.config import get_settings
from app.data_sources.base_provider import TYPE_HISTORICAL_DATASET, DataProvider, ProviderStatus


class NSRDBDataSource(DataProvider):
    """NREL NSRDB PSM3 as a status-reporting historical dataset provider."""

    name = "nsrdb"
    source_id = "SRC-NSRDB-001"
    provider_type = TYPE_HISTORICAL_DATASET

    def status(self) -> ProviderStatus:
        settings = get_settings()
        keyed = bool(settings.NREL_API_KEY)
        return ProviderStatus(
            name=self.name,
            source_id=self.source_id,
            provider_type=self.provider_type,
            available=True,  # endpoint is public; key decides usability
            loaded=keyed,
            mode="real",
            detail=(
                "Configured: historical hourly GHI/DNI/DHI (training/backtesting "
                "only; live forecasts use open-meteo). Datasets: suny-india "
                "2000-2014, himawari 2016-2020, himawari-tmy."
                if keyed
                else "Not configured: set NREL_API_KEY (free at developer.nlr.gov/signup). "
                "Historical only - never used as a live forecast source."
            ),
            extra={
                "coverage": "India incl. Bengaluru (PSM3 region)",
                "resolution": "60 min (30 min for some datasets)",
                "requires_api_key": True,
                "supports_forecast": False,
                "registry_verified": "pending",
            },
        )
