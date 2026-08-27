"""RiskAgent - deterministic operational risk level for a DSM interval.

Combines how far the deviation exceeds the allowed band with forecast confidence
to produce a 0-100 score and a LOW/MEDIUM/HIGH/CRITICAL band. This is a transparent,
reproducible scoring rule (no arbitrary tuning, no LLM).

The composite variant `calculate_dynamic_risk_score` (deviation x 0.6 + PV-health
risk x 0.4) lives in app.agents.dynamic_risk and is exposed here via
`dynamic_score()` so callers have one import point.
"""

from __future__ import annotations

from app.agents.dynamic_risk import calculate_dynamic_risk_score

LOW, MEDIUM, HIGH, CRITICAL = "LOW", "MEDIUM", "HIGH", "CRITICAL"


class RiskAgent:
    def score(
        self,
        deviation_percent: float,
        allowed_dsm_threshold_percent: float,
        confidence_score: float,
    ) -> dict:
        # How much of the deviation is over the allowed band, relative to the band.
        band = max(allowed_dsm_threshold_percent, 1.0)
        breach_ratio = max(0.0, deviation_percent - allowed_dsm_threshold_percent) / band

        # Breach drives most of the score; low confidence adds a penalty.
        score = min(100.0, breach_ratio * 60.0) + (1.0 - confidence_score) * 40.0
        score = max(0.0, min(100.0, score))

        if score < 25:
            level = LOW
        elif score < 50:
            level = MEDIUM
        elif score < 75:
            level = HIGH
        else:
            level = CRITICAL

        return {"risk_score": round(score, 2), "risk_level": level}

    def dynamic_score(
        self,
        actual_kwh: float,
        scheduled_kwh: float,
        pv_score: float,
        w_dev: float = 0.6,
        w_pv: float = 0.4,
    ) -> dict:
        """Weighted composite: deviation % (w_dev=0.6) + PV health risk (w_pv=0.4)."""
        return calculate_dynamic_risk_score(
            actual_kwh=actual_kwh,
            scheduled_kwh=scheduled_kwh,
            pv_score=pv_score,
            w_dev=w_dev,
            w_pv=w_pv,
        )
