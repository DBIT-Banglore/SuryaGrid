"""DSMEngine - deterministic Deviation Settlement Mechanism evaluation.

Supports three modes via a single evaluate() over a RuleProfile:
  - simple threshold : one band, denominator = scheduled
  - band / slab      : escalating slab charges (KERC style)
  - configurable     : any profile resolved from the DB

Deviation is computed against the profile's denominator (available capacity for
CERC/KERC WS sellers, or scheduled for simple mode). Charges apply only to the
portion of deviation beyond the tolerance band, on a per-slab basis. No LLM does
the math. See docs/FORMULA_SOURCES.md#9-deviation--dsm and docs/DSM_RULE_SOURCES.md.

Each result also carries a DSM risk classification (NORMAL/MODERATE/HIGH/CRITICAL)
with a recommended action and the applicable penalty slab — see
docs/FORMULA_SOURCES.md#14-dsm-risk-classification.
"""

from __future__ import annotations

from app.agents.dynamic_risk import classify_dsm_risk
from app.dsm.base_rules import RuleProfile
from app.dsm.dsm_sources import (
    DENOM_AVAILABLE_CAPACITY,
    DIR_BOTH,
    DIR_OVER,
    DIR_UNDER,
    DIR_WITHIN,
    INVALID_SCHEDULE,
    NO_PENALTY,
    PENALTY_RISK,
)


class DSMEngine:
    def evaluate(
        self,
        profile: RuleProfile,
        scheduled_mw: float,
        measured_mw: float,
        installed_capacity_mw: float,
        interval_hours: float | None = None,
    ) -> dict:
        """Evaluate one interval against a rule profile.

        `measured_mw` is actual injection when available, else the predicted nowcast.
        Returns the full DSM result dict (see docs/DSM_RULE_SOURCES.md section 4).
        """
        if interval_hours is None:
            interval_hours = profile.time_block_minutes / 60.0

        denom = (
            installed_capacity_mw
            if profile.denominator == DENOM_AVAILABLE_CAPACITY
            else scheduled_mw
        )
        rule_source = self._rule_source(profile)

        if denom is None or denom <= 0:
            return self._result(
                scheduled_mw,
                measured_mw,
                installed_capacity_mw,
                0.0,
                0.0,
                DIR_WITHIN,
                None,
                INVALID_SCHEDULE,
                0.0,
                0.0,
                rule_source,
                [],
                explanation="Denominator (available capacity or schedule) is zero/negative; "
                "no DSM deviation can be assessed.",
            )

        deviation_mw = measured_mw - scheduled_mw
        abs_dev = abs(deviation_mw)

        # Deviation formula (project standard, docs/FORMULA_SOURCES.md#9):
        #   DSM_deviation_pct = ((measured - scheduled) / time_interval) x 100
        # The MW imbalance is normalised by the DSM interval in hours (so 15-min
        # blocks and hourly blocks are comparable) and expressed as a percent of
        # the profile's regulatory denominator (available capacity for CERC/KERC
        # WS profiles, scheduled MW in simple mode). When the caller passes an
        # interval equal to the profile's own time block, this reduces to the
        # classic per-block percentage.
        block_hours = profile.time_block_minutes / 60.0
        deviation_percent = (
            (abs_dev / max(interval_hours, 1e-9)) * block_hours / denom
        ) * 100.0

        if deviation_percent <= profile.tolerance_percent:
            direction = DIR_WITHIN
            return self._result(
                scheduled_mw,
                measured_mw,
                installed_capacity_mw,
                deviation_mw,
                deviation_percent,
                direction,
                "within_band",
                NO_PENALTY,
                0.0,
                0.0,
                rule_source,
                [],
                explanation=self._explain(NO_PENALTY, deviation_percent, direction, profile, 0.0),
            )

        direction = DIR_OVER if deviation_mw > 0 else DIR_UNDER
        slabs, chargeable_mwh, charge = self._apply_slabs(
            profile, deviation_percent, direction, denom, interval_hours
        )
        band_label = slabs[-1]["slab_percent"] if slabs else f">{profile.tolerance_percent:.0f}%"
        effective_rate = slabs[-1]["rate_inr_per_kwh"] if slabs else 0.0

        return self._result(
            scheduled_mw,
            measured_mw,
            installed_capacity_mw,
            deviation_mw,
            deviation_percent,
            direction,
            band_label,
            PENALTY_RISK,
            effective_rate,
            charge,
            rule_source,
            slabs,
            explanation=self._explain(PENALTY_RISK, deviation_percent, direction, profile, charge),
            chargeable_energy_mwh=chargeable_mwh,
        )

    def _apply_slabs(self, profile, deviation_percent, direction, denom, interval_hours):
        slabs: list[dict] = []
        chargeable_mwh = 0.0
        charge = 0.0
        for band in profile.sorted_bands():
            if band.direction not in (DIR_BOTH, direction):
                continue
            slab_low = max(band.min_deviation_percent, profile.tolerance_percent)
            if deviation_percent <= slab_low:
                continue
            slab_hi = min(band.max_deviation_percent, deviation_percent)
            if slab_hi <= slab_low:
                continue
            pct_in_slab = slab_hi - slab_low
            energy_mwh = (pct_in_slab / 100.0) * denom * interval_hours
            slab_charge = energy_mwh * band.rate_per_mwh()
            chargeable_mwh += energy_mwh
            charge += slab_charge
            slabs.append(
                {
                    "slab_percent": f"{slab_low:.0f}-{slab_hi:.0f}%",
                    "rate_inr_per_kwh": round(band.rate_per_mwh() / 1000.0, 4),
                    "energy_mwh": round(energy_mwh, 4),
                    "charge_inr": round(slab_charge, 2),
                    "source_reference": band.source_reference,
                }
            )
        return slabs, round(chargeable_mwh, 4), round(charge, 2)

    @staticmethod
    def _rule_source(profile: RuleProfile) -> dict:
        return {
            "name": profile.source_name,
            "url": profile.source_url,
            "status": profile.source_status,
            "profile": profile.name,
            "regulator": profile.regulator,
            "denominator": profile.denominator,
        }

    @staticmethod
    def _explain(status, deviation_percent, direction, profile, charge) -> str:
        if status == NO_PENALTY:
            return (
                f"Within band: deviation {deviation_percent:.1f}% is inside the "
                f"{profile.tolerance_percent:.0f}% tolerance ({profile.name})."
            )
        dir_word = "over-injection" if direction == DIR_OVER else "under-injection"
        msg = (
            f"Penalty risk: {deviation_percent:.1f}% deviation ({dir_word}) exceeds the "
            f"{profile.tolerance_percent:.0f}% band under {profile.regulator or 'operator'} rules."
        )
        if charge > 0:
            msg += f" Estimated DSM charge: \u20b9{charge:,.0f}."
        if profile.source_status != "OFFICIAL_SOURCE":
            msg += " (Rates are configurable/pending official source; not authoritative.)"
        return msg

    @staticmethod
    def _result(
        scheduled_mw,
        measured_mw,
        capacity_mw,
        deviation_mw,
        deviation_percent,
        direction,
        dsm_band,
        penalty_status,
        charge_rate,
        charge,
        rule_source,
        slabs,
        explanation,
        chargeable_energy_mwh=0.0,
    ) -> dict:
        risk = classify_dsm_risk(deviation_percent)
        return {
            "scheduled_generation_mw": round(scheduled_mw, 4),
            "measured_generation_mw": round(measured_mw, 4),
            "installed_capacity_mw": round(capacity_mw, 4),
            "deviation_mw": round(deviation_mw, 4),
            "deviation_percent": round(deviation_percent, 2),
            "deviation_direction": direction,
            "dsm_band": dsm_band,
            "penalty_status": penalty_status,
            "charge_rate": charge_rate,
            "chargeable_energy_mwh": chargeable_energy_mwh,
            "estimated_dsm_charge": charge,
            "rule_source": rule_source,
            "slab_breakdown": slabs,
            "explanation": explanation,
            "risk_level": risk["risk_level"],
            "risk_action": risk["action"],
            "penalty_slab": risk["penalty_slab"],
            "rate_inr_per_kwh": risk["rate_inr_per_kwh"],
        }
