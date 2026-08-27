"""Advanced DSM API - configurable rule profiles + advanced deviation check.

  GET  /dsm/rule-profiles        - list configurable rule profiles (+ source status)
  POST /dsm/rule-profiles        - create a rule profile
  GET  /dsm/rule-profiles/{id}   - get one profile (by UUID or name)
  POST /dsm/advanced-check       - evaluate deviation under a resolved rule profile

The legacy simple check remains at POST /dsm/check (routes_predict). No figure here
is presented as regulatory truth: profiles carry a source_status.
See docs/DSM_RULE_SOURCES.md.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.dsm_engine_agent import DSMEngineAgent
from app.core.exceptions import NotFoundError
from app.data_sources import source_registry as sr
from app.db import repository
from app.db.session import get_db
from app.dsm import dsm_repository
from app.dsm.configurable_rules import profile_from_payload
from app.dsm.dsm_sources import source_for_regulator
from app.schemas.requests import DSMAdvancedCheckRequest, DSMRuleProfileCreateRequest
from app.utils.response import success_response

router = APIRouter()
_agent = DSMEngineAgent()


def _serialize_profile(p) -> dict:
    return {
        "id": str(p.id),
        "name": p.name,
        "region": p.region,
        "regulator": p.regulator,
        "denominator": p.denominator,
        "tolerance_percent": p.tolerance_percent,
        "time_block_minutes": p.time_block_minutes,
        "source_name": p.source_name,
        "source_url": p.source_url,
        "source_status": p.source_status,
        "effective_from": p.effective_from,
        "effective_to": p.effective_to,
        "notes": p.notes,
        "bands": [
            {
                "min_deviation_percent": b.min_deviation_percent,
                "max_deviation_percent": b.max_deviation_percent,
                "direction": b.direction,
                "charge_rate": b.charge_rate,
                "unit": b.unit,
                "source_reference": b.source_reference,
            }
            for b in sorted(p.bands, key=lambda x: x.min_deviation_percent)
        ],
    }


@router.get("/dsm/rule-profiles")
async def list_rule_profiles(db: AsyncSession = Depends(get_db)):
    if await dsm_repository.count_profiles(db) == 0:
        await dsm_repository.seed_default_profiles(db)
    profiles = await dsm_repository.list_profiles(db)
    return success_response(
        data={"count": len(profiles), "profiles": [_serialize_profile(p) for p in profiles]}
    )


@router.post("/dsm/rule-profiles")
async def create_rule_profile(req: DSMRuleProfileCreateRequest, db: AsyncSession = Depends(get_db)):
    profile = profile_from_payload(req.model_dump())
    row = await dsm_repository.create_profile(db, profile)
    return success_response(data=_serialize_profile(row), message="Rule profile created")


@router.get("/dsm/rule-profiles/{profile_id}")
async def get_rule_profile(profile_id: str, db: AsyncSession = Depends(get_db)):
    row = await dsm_repository.get_profile(db, profile_id)
    if row is None:
        raise NotFoundError(f"DSM rule profile '{profile_id}' not found")
    return success_response(data=_serialize_profile(row))


async def _resolve_profile(db: AsyncSession, req: DSMAdvancedCheckRequest):
    """Resolve a RuleProfile via the DSMEngineAgent (id/name -> region/regulator -> default)."""
    return await _agent.resolve_profile(
        db, rule_profile_id=req.rule_profile_id, region=req.region, regulator=req.regulator
    )


@router.post("/dsm/advanced-check")
async def advanced_check(req: DSMAdvancedCheckRequest, db: AsyncSession = Depends(get_db)):
    profile = await _resolve_profile(db, req)
    measured = (
        req.actual_generation_mw
        if req.actual_generation_mw is not None
        else req.predicted_generation_mw
    )
    result = _agent.evaluate(
        profile=profile,
        scheduled_mw=req.scheduled_generation_mw,
        measured_mw=measured,
        installed_capacity_mw=req.installed_capacity_mw,
        interval_hours=req.interval_hours,
    )
    result["actual_generation_mw"] = req.actual_generation_mw
    result["predicted_generation_mw"] = req.predicted_generation_mw
    result["profile"] = profile.name

    # Composite dynamic risk (docs/FORMULA_SOURCES.md#11): deviation % weighted
    # 0.6 + PV-health risk weighted 0.4. PV health proxies the ratio of actual
    # to predicted generation (1.0 = healthy plant, 0 = no output).
    from app.agents.dynamic_risk import calculate_dynamic_risk_score

    pv_health = (
        0.0
        if req.predicted_generation_mw <= 0
        else min(1.0, measured / req.predicted_generation_mw)
    )
    result["dynamic_risk"] = calculate_dynamic_risk_score(
        actual_kwh=measured,
        scheduled_kwh=req.scheduled_generation_mw,
        pv_score=pv_health,
    )

    # The engine already adds risk_level/risk_action/penalty_slab/rate to the
    # result via classify_dsm_risk in DSMEngine._result(). The dynamic_risk
    # dict above also carries risk_level/action/penalty_slab. We surface both
    # so the UI can show the deviation-based classification and the composite
    # dynamic risk score side by side.

    # Persist when the site is registered
    site = await repository.get_site(db, req.site_id) if req.site_id else None
    persisted = False
    if site is not None:
        await _agent.persist(db, site.id, profile, result)
        persisted = True
    result["persisted"] = persisted

    src_id = source_for_regulator(profile.regulator)
    result["sources"] = sr.cite(src_id) if src_id else []
    return success_response(data=result)
