"""FuzzyRiskAgent - operational risk via fuzzy inference.

Combines three drivers into a 0-100 risk score using genuine fuzzy logic
(triangular membership functions, a Mamdani-style rule base with min-AND /
max-aggregation, and centroid defuzzification):

  - breach       : how far deviation exceeds the DSM tolerance band
  - uncertainty  : forecast uncertainty (1 - confidence)
  - volatility   : weather volatility (cloud cover)

Deterministic and transparent (no LLM, no arbitrary tuning beyond documented
membership functions). SOURCE: docs/FORMULA_SOURCES.md#fuzzy.
"""

from __future__ import annotations

LOW, MEDIUM, HIGH, CRITICAL = "LOW", "MEDIUM", "HIGH", "CRITICAL"


def _tri(x: float, a: float, b: float, c: float) -> float:
    """Triangular membership of x for (a, b, c), with shoulder handling.

    Left shoulder (a == b): membership is 1.0 for x <= b.
    Right shoulder (b == c): membership is 1.0 for x >= b.
    """
    if a == b and x <= a:
        return 1.0
    if b == c and x >= c:
        return 1.0
    if x <= a or x >= c:
        return 0.0
    if x < b:
        return (x - a) / (b - a)
    if x > b:
        return (c - x) / (c - b)
    return 1.0  # x == b


# Output fuzzy sets on the 0-100 risk axis (a, b, c).
_OUT_SETS = {
    LOW: (0.0, 0.0, 33.0),
    MEDIUM: (17.0, 42.0, 67.0),
    HIGH: (50.0, 75.0, 92.0),
    CRITICAL: (75.0, 100.0, 100.0),
}


def _lmh(x: float) -> dict[str, float]:
    """Low/Medium/High memberships for a normalized [0,1] input."""
    return {
        "low": _tri(x, 0.0, 0.0, 0.4),
        "med": _tri(x, 0.2, 0.5, 0.8),
        "high": _tri(x, 0.6, 1.0, 1.0),
    }


class FuzzyRiskAgent:
    def score(
        self,
        deviation_percent: float,
        allowed_dsm_threshold_percent: float,
        confidence_score: float,
        cloud_cover_percent: float = 0.0,
    ) -> dict:
        band = max(allowed_dsm_threshold_percent, 1.0)
        # Normalize inputs to [0,1].
        breach = min(1.0, max(0.0, (deviation_percent - band) / (2.0 * band)))
        uncertainty = min(1.0, max(0.0, 1.0 - confidence_score))
        volatility = min(1.0, max(0.0, cloud_cover_percent / 100.0))

        b, u, v = _lmh(breach), _lmh(uncertainty), _lmh(volatility)

        # Escalating rule base (strength, output set). Uncertainty/volatility ADD risk
        # rather than diluting a high-breach case, so more bad factors -> higher risk.
        rules = [
            (b["high"], CRITICAL),  # extreme deviation dominates
            (min(b["med"], max(u["high"], u["med"])), CRITICAL),  # med dev + uncertainty escalates
            (b["med"], HIGH),  # medium deviation
            (min(u["high"], v["high"]), HIGH),  # very uncertain AND very cloudy
            (min(b["low"], u["high"]), MEDIUM),  # low dev but very uncertain
            (min(b["low"], v["high"]), MEDIUM),  # low dev but very cloudy
            (min(b["low"], u["low"], 1.0 - v["high"]), LOW),  # calm all around
        ]

        # Aggregate rule strengths per output set (max).
        agg: dict[str, float] = {LOW: 0.0, MEDIUM: 0.0, HIGH: 0.0, CRITICAL: 0.0}
        for strength, out_set in rules:
            if strength > agg[out_set]:
                agg[out_set] = strength

        score = self._defuzzify(agg)
        level = self._level(score)
        return {
            "fuzzy_risk_score": round(score, 2),
            "fuzzy_risk_level": level,
            "memberships": {
                "breach": round(breach, 3),
                "uncertainty": round(uncertainty, 3),
                "volatility": round(volatility, 3),
            },
        }

    @staticmethod
    def _defuzzify(agg: dict[str, float]) -> float:
        """Centroid defuzzification over the 0-100 universe (1-unit sampling)."""
        num = 0.0
        den = 0.0
        for x in range(0, 101):
            mu = 0.0
            for set_name, strength in agg.items():
                if strength <= 0.0:
                    continue
                a, b, c = _OUT_SETS[set_name]
                mu = max(mu, min(strength, _tri(float(x), a, b, c)))
            num += x * mu
            den += mu
        if den == 0.0:
            return 0.0
        return num / den

    @staticmethod
    def _level(score: float) -> str:
        """Risk level thresholds aligned to the DSM classification (see docs/FORMULA_SOURCES.md#14):
        <16 LOW (Normal), <41 MEDIUM (Moderate), <=71 HIGH, >71 CRITICAL.
        """
        if score < 16:
            return LOW
        if score < 41:
            return MEDIUM
        if score <= 71:
            return HIGH
        return CRITICAL
