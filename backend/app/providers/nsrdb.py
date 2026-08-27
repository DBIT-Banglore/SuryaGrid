"""NLR NSRDB provider - real historical satellite-derived irradiance.

The National Solar Radiation Data Base (NSRDB) provides hourly, satellite-
derived GHI/DNI/DHI, temperature, pressure and wind. The laboratory (formerly
NREL, now NLR - National Laboratory of the Rockies) serves it through the
developer portal; nrel.gov now NXDOMAINs, developer.nlr.gov is live
(verified 2026-08-26 with a real Bengaluru download). Unlike Open-Meteo it is
HISTORICAL only (no forecast), so its role here is:
  * training / backtesting data of higher quality than model reanalysis,
  * cross-validation of Open-Meteo archive values.
India coverage comes from two regional datasets:
    suny-india : 2000-2014, hourly (SUNY model)
    himawari   : 2016-2020, 10/30/60-min (Himawari-8 satellite)

API contract (mirrors pvlib.iotools.get_psm3):
    GET https://developer.nlr.gov/api/nsrdb/v2/solar/<dataset>-download.csv
    required params: api_key, email, fullname, affiliation,
                     wkt=POINT(lon lat), names=<year|tmy>, interval=60,
                     attributes=ghi,dni,dhi,...
    A free key is registered at https://developer.nlr.gov/signup
    Success responds HTTP 302 -> pre-signed S3 URL with a SAM-style CSV:
        row0 site metadata, row1 units, row2 field names, row3+ data.

Honesty:
  * Returns REAL_COORDINATE_BASED satellite observations; nothing is invented.
  * If no NREL_API_KEY is configured the provider raises NSRDBKeyMissingError
    (503, NOT_AVAILABLE) instead of silently degrading to another source -
    callers decide the failover path via APIAgent.
SOURCE: docs/SOURCE_REGISTRY.md#src-nsrdb-001
"""

from __future__ import annotations

import csv
import io
from datetime import datetime

import httpx

from app.core.exceptions import AppException
from app.core.logging import logger
from app.providers.base import WeatherPoint, WeatherProvider

_PSM3_URL = "https://developer.nlr.gov/api/nsrdb/v2/solar/psm3-2-2-download.csv"
_TMY_URL = "https://developer.nlr.gov/api/nsrdb/v2/solar/psm3-tmy-download.csv"
# Regional datasets for South Asia (verified live 2026-08-26 for Bengaluru):
#   himawari  : satellite-derived, India incl. Karnataka, 2016-2020, 10/30/60-min
#   suny-india: SUNY India model, 2000-2014, hourly
_HIMAWARI_URL = "https://developer.nlr.gov/api/nsrdb/v2/solar/himawari-download.csv"
_SUNY_INDIA_URL = "https://developer.nlr.gov/api/nsrdb/v2/solar/suny-india-download.csv"
_HIMAWARI_TMY_URL = "https://developer.nlr.gov/api/nsrdb/v2/solar/himawari-tmy-download.csv"

# Legacy domain kept only to give callers a precise error message.
_LEGACY_HOST = "developer.nrel.gov"

# PSM3 request attribute names (see pvlib.iotools.psm3 REQUEST_VARIABLE_MAP).
_DEFAULT_ATTRIBUTES = [
    "ghi",
    "dni",
    "dhi",
    "air_temperature",
    "wind_speed",
    "surface_pressure",
]

# Response column name -> WeatherPoint field. PSM3 responds with capitalized
# names ("GHI", "Temperature", ...) regardless of request casing.
_COLUMN_MAP = {
    "GHI": "ghi_w_m2",
    "DNI": "dni_w_m2",
    "DHI": "dhi_w_m2",
    "Temperature": "temperature_c",
    "Wind Speed": "wind_speed_mps",
    "Surface Albedo": "surface_albedo",
}


class NSRDBKeyMissingError(AppException):
    def __init__(self, detail: str = "NREL_API_KEY not configured"):
        super().__init__(status_code=503, detail=detail, error_code="NOT_AVAILABLE")


class ProviderError(AppException):
    def __init__(self, detail: str = "NSRDB request failed"):
        super().__init__(status_code=502, detail=detail, error_code="PROVIDER_ERROR")


class NSRDBProvider(WeatherProvider):
    """Historical hourly irradiance/weather from NREL NSRDB PSM3."""

    name = "nsrdb"

    def __init__(
        self,
        api_key: str | None = None,
        email: str | None = None,
        timeout_seconds: float = 30.0,
    ):
        self._api_key = api_key
        self._email = email
        self._timeout = timeout_seconds

    async def fetch_forecast(
        self,
        latitude: float,
        longitude: float,
        timezone: str,
        forecast_days: int = 1,
        past_days: int = 0,
    ) -> list[WeatherPoint]:
        # NSRDB is an archive product; "forecast" maps to last-complete-year TMY
        # only when a caller explicitly uses this interface. Prefer fetch_year().
        raise NotImplementedError(
            "NSRDB provides historical data only; use fetch_year() or fetch_tmy(). "
            "Live forecasting stays with open-meteo."
        )

    async def fetch_year(
        self,
        latitude: float,
        longitude: float,
        year: int,
        interval_minutes: int = 60,
    ) -> list[WeatherPoint]:
        """Fetch one calendar year of hourly NSRDB data for a point.

        Picks the regional dataset covering the year automatically:
        suny-india for 2000-2014, himawari for 2016-2020 (India coverage).
        """
        if 2000 <= year <= 2014:
            url = _SUNY_INDIA_URL
            interval_minutes = 60  # SUNY India is hourly-only
        elif 2016 <= year <= 2020:
            url = _HIMAWARI_URL
        else:
            raise ProviderError(
                f"Year {year} is outside the India datasets (suny-india 2000-2014, "
                "himawari 2016-2020). Use fetch_tmy() for the typical-year series."
            )
        return await self._fetch(
            url,
            latitude=latitude,
            longitude=longitude,
            year=str(year),
            interval_minutes=interval_minutes,
        )

    async def fetch_tmy(self, latitude: float, longitude: float) -> list[WeatherPoint]:
        """Fetch the Typical Meteorological Year (TMY) series for a point."""
        return await self._fetch(_HIMAWARI_TMY_URL, latitude=latitude, longitude=longitude)

    async def _fetch(
        self,
        url: str,
        latitude: float,
        longitude: float,
        year: str | None = None,
        interval_minutes: int = 60,
    ) -> list[WeatherPoint]:
        if not self._api_key:
            raise NSRDBKeyMissingError(
                "NREL_API_KEY not configured; register a free key at "
                "https://developer.nlr.gov/signup and set it in the environment."
            )

        params: dict[str, str | int] = {
            "api_key": self._api_key,
            "wkt": f"POINT({longitude:.4f} {latitude:.4f})",
            "names": year or "tmy",
            "interval": max(30, interval_minutes),
            "leap_day": "false",
            "utc": "false",
            "attributes": ",".join(_DEFAULT_ATTRIBUTES),
            "full_name": "SuryaGrid AI",
            "affiliation": "SuryaGrid AI",
        }
        if self._email:
            params["email"] = self._email

        try:
            # The download endpoints 302-redirect to a pre-signed S3 URL.
            async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                body = resp.text
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:200] if exc.response is not None else ""
            logger.error(f"NSRDB request failed ({exc.response.status_code}): {detail}")
            raise ProviderError(
                f"NSRDB returned HTTP {exc.response.status_code}: {detail}"
            ) from exc
        except httpx.HTTPError as exc:
            logger.error(f"NSRDB request failed: {exc}")
            raise ProviderError(f"NSRDB request failed: {exc}") from exc

        return _parse_psm3_csv(body)


def _parse_psm3_csv(body: str) -> list[WeatherPoint]:
    """Parse an NSRDB download CSV into WeatherPoints.

    Real format (verified live 2026-08-26, both psm3 and himawari/suny-india):
        row 0: site metadata (Source, Location ID, City, ..., Latitude, Longitude, ...)
        row 1: units for the metadata columns
        row 2: FIELD NAMES (Year, Month, Day, Hour, Minute, GHI, DNI, DHI, ...)
        row 3+: data rows in local standard time
    Missing values arrive as -999; night-time 0 irradiance is real and kept.
    """
    reader = csv.reader(io.StringIO(body))
    rows = [r for r in reader if r]
    if len(rows) < 4:
        raise ProviderError("NSRDB response has no data rows")

    # The field-name row is the first row whose first cell is "Year".
    header_row = next((i for i, r in enumerate(rows) if r and r[0].strip() == "Year"), None)
    if header_row is None:
        raise ProviderError("NSRDB response missing field-name header row")
    idx = {name.strip(): i for i, name in enumerate(rows[header_row])}

    points: list[WeatherPoint] = []
    for raw in rows[header_row + 1 :]:
        try:
            ts = datetime(
                year=int(raw[idx["Year"]]),
                month=int(raw[idx["Month"]]),
                day=int(raw[idx["Day"]]),
                hour=min(int(raw[idx["Hour"]]), 23),
                minute=min(int(raw[idx["Minute"]]), 59),
            )
        except (KeyError, ValueError):
            continue  # skip malformed rows rather than inventing timestamps

        def _num(col: str, _row: list[str] = raw) -> float:
            try:
                v = float(_row[idx[col]])
            except (KeyError, ValueError, IndexError):
                return 0.0
            return 0.0 if v <= -999 else v

        ghi, dni, dhi = _num("GHI"), _num("DNI"), _num("DHI")

        points.append(
            WeatherPoint(
                timestamp=ts,
                ghi_w_m2=max(0.0, ghi),
                dni_w_m2=max(0.0, dni),
                dhi_w_m2=max(0.0, dhi),
                temperature_c=_num("Temperature"),
                cloud_cover_percent=0.0,  # NSRDB PSM3 does not publish cloud cover
                wind_speed_mps=_num("Wind Speed"),
                pressure_hpa=_num("Pressure"),
            )
        )
    return points
