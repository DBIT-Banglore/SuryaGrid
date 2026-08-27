"""Sources API - source registry records and live data-source statuses.

Exposes the machine-readable source registry (docs/SOURCE_REGISTRY.md mirror) and
the real, honest status of each data provider. No status is faked: an unavailable
or unloaded source reports exactly that.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.core.exceptions import NotFoundError
from app.data_sources import source_registry as sr
from app.data_sources.kaggle_solar_provider import KaggleSolarProvider
from app.data_sources.live_weather_provider import LiveWeatherProvider
from app.data_sources.nsrdb_provider import NSRDBDataSource
from app.data_sources.substation_provider import SubstationProvider
from app.data_sources.synthetic_weather_provider import SyntheticWeatherProvider
from app.utils.response import success_response

router = APIRouter()


@router.get("/sources")
async def list_sources(type: str | None = None):
    """List every registered source (weather, dataset, substation, formula, dsm_rule)."""
    records = [s.to_dict() for s in sr.list_sources(type_filter=type)]
    return success_response(
        data={"count": len(records), "sources": records},
        message="Source registry (mirror of docs/SOURCE_REGISTRY.md)",
    )


@router.get("/sources/{source_id}")
async def get_source(source_id: str):
    rec = sr.get_source(source_id)
    if rec is None:
        raise NotFoundError(f"Source {source_id} not found")
    return success_response(data=rec.to_dict())


@router.get("/data-sources/status")
async def data_sources_status():
    """Real status of each data provider (Kaggle / live weather / substation / synthetic)."""
    providers = [
        LiveWeatherProvider(),
        KaggleSolarProvider(),
        SubstationProvider(),
        SyntheticWeatherProvider(),
        NSRDBDataSource(),
    ]
    statuses = [p.status().to_dict() for p in providers]
    return success_response(
        data={
            "providers": statuses,
            "any_real_available": any(s["available"] and s["mode"] == "real" for s in statuses),
        }
    )
