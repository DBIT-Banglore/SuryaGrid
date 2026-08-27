"""Machine-readable source registry.

Mirror of docs/SOURCE_REGISTRY.md. Every external dataset, API, formula family and
regulatory framework the platform relies on is recorded here with a stable source
ID, classification, license, access date, units and notes. Prediction responses and
the /api/v1/sources endpoints cite these records so every number is traceable.

Classification (see docs/SOURCE_REGISTRY.md#1-classification-scheme):
    OFFICIAL_SOURCE | DATASET_DERIVED | MODEL_LEARNED | USER_CONFIGURABLE |
    FALLBACK_DEFAULT | USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

# Classification constants
OFFICIAL_SOURCE = "OFFICIAL_SOURCE"
DATASET_DERIVED = "DATASET_DERIVED"
MODEL_LEARNED = "MODEL_LEARNED"
USER_CONFIGURABLE = "USER_CONFIGURABLE"
FALLBACK_DEFAULT = "FALLBACK_DEFAULT"
USER_CONFIGURABLE_PENDING = "USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE"

VALID_CLASSIFICATIONS = {
    OFFICIAL_SOURCE,
    DATASET_DERIVED,
    MODEL_LEARNED,
    USER_CONFIGURABLE,
    FALLBACK_DEFAULT,
    USER_CONFIGURABLE_PENDING,
}


@dataclass(slots=True)
class SourceRecord:
    """One traceable source. `verified` reflects live verification status."""

    id: str
    name: str
    type: str  # weather | dataset | substation | formula | dsm_rule | synthetic
    classification: str
    url: str
    license: str
    access_date: str
    unit: str = ""
    fields: dict[str, str] = field(default_factory=dict)
    notes: str = ""
    verified: str = "pending"  # verified | framework | pending
    doc_anchor: str = ""

    def to_dict(self) -> dict:
        d = asdict(self)
        d["reference"] = self.url
        d["doc"] = f"docs/SOURCE_REGISTRY.md#{self.doc_anchor}" if self.doc_anchor else ""
        return d


# Access date of the live verification pass (see docs/SOURCE_REGISTRY.md section 2).
_ACCESS = "2026-07-05"

SOURCES: dict[str, SourceRecord] = {
    "SRC-OPENMETEO-001": SourceRecord(
        id="SRC-OPENMETEO-001",
        name="Open-Meteo Forecast API",
        type="weather",
        classification=OFFICIAL_SOURCE,
        url="https://open-meteo.com/en/docs",
        license="CC BY 4.0 (free, key-less, non-commercial)",
        access_date=_ACCESS,
        unit="irradiance W/m2; temp C; humidity %; cloud %; wind m/s; pressure hPa",
        fields={
            "irradiance_w_m2": "shortwave_radiation",
            "dni_w_m2": "direct_normal_irradiance",
            "dhi_w_m2": "diffuse_radiation",
            "temperature_c": "temperature_2m",
            "humidity_percent": "relative_humidity_2m",
            "cloud_cover_percent": "cloud_cover",
            "wind_speed_mps": "wind_speed_10m",
            "pressure_hpa": "surface_pressure",
            "precipitation_probability_percent": "precipitation_probability",
            "weather_code": "weather_code",
        },
        notes="Radiation averaged over preceding hour. Forecast up to 16 days. Archive = ERA5.",
        verified="verified",
        doc_anchor="src-openmeteo-001",
    ),
    "SRC-KAGGLE-SOLAR-001": SourceRecord(
        id="SRC-KAGGLE-SOLAR-001",
        name="Kaggle Solar Radiation Prediction (NASA HI-SEAS)",
        type="dataset",
        classification=OFFICIAL_SOURCE,
        url="https://www.kaggle.com/datasets/dronio/SolarEnergy",
        license="Public-domain style per dataset page (verify before redistribution)",
        access_date=_ACCESS,
        unit="Radiation W/m2 (target); Temperature F; Pressure inHg; Speed mph; Humidity %",
        fields={
            "timestamp": "UNIXTime",
            "irradiance_w_m2": "Radiation",
            "temperature_c": "Temperature (degF -> degC)",
            "pressure_hpa": "Pressure (inHg -> hPa)",
            "humidity_percent": "Humidity",
            "wind_speed_mps": "Speed (mph -> m/s)",
            "wind_direction_deg": "WindDirection(Degrees)",
        },
        notes="Owner 'dronio'. Target is irradiance, NOT plant generation -> convert via pvlib.",
        verified="verified",
        doc_anchor="src-kaggle-solar-001",
    ),
    "SRC-OSM-SUBSTATION-001": SourceRecord(
        id="SRC-OSM-SUBSTATION-001",
        name="OpenStreetMap substations via Overpass API",
        type="substation",
        classification=OFFICIAL_SOURCE,
        url="https://overpass-api.de/api/interpreter",
        license="ODbL 1.0 (attribution: (c) OpenStreetMap contributors; share-alike)",
        access_date=_ACCESS,
        unit="degrees (lat/lon); voltage V",
        fields={
            "name": "name",
            "voltage_level": "voltage",
            "operator": "operator",
            "latitude": "lat",
            "longitude": "lon",
        },
        notes="Tag power=substation. Confidence 0.6 default (OSM completeness varies).",
        verified="verified",
        doc_anchor="src-osm-substation-001",
    ),
    "SRC-CERC-DSM-2024": SourceRecord(
        id="SRC-CERC-DSM-2024",
        name="CERC (Deviation Settlement Mechanism & Related Matters) Regulations, 2024",
        type="dsm_rule",
        classification=USER_CONFIGURABLE_PENDING,
        url="https://cercind.gov.in",
        license="Government regulation (public)",
        access_date=_ACCESS,
        unit="deviation %; charge INR/kWh",
        notes="Framework OFFICIAL. Deviation vs available capacity (Reg 6(2)(a)); 'X' and "
        "rates set by CERC order -> kept configurable. System does not claim regulatory accuracy.",
        verified="framework",
        doc_anchor="src-cerc-dsm-2024",
    ),
    "SRC-KERC-DSM": SourceRecord(
        id="SRC-KERC-DSM",
        name="KERC Forecasting, Scheduling & DSM (Karnataka)",
        type="dsm_rule",
        classification=USER_CONFIGURABLE_PENDING,
        url="https://karnatakaerc.gov.in",
        license="Government regulation (public)",
        access_date=_ACCESS,
        unit="deviation %; charge INR/kWh",
        notes="Solar band +/-5% (framework OFFICIAL). Slab rates 2/4/6 INR/kWh are representative "
        "defaults pending exact current order.",
        verified="framework",
        doc_anchor="src-kerc-dsm",
    ),
    "SRC-PVLIB-001": SourceRecord(
        id="SRC-PVLIB-001",
        name="pvlib-python PV models (Erbs, Ineichen, Faiman, PVWatts)",
        type="formula",
        classification=OFFICIAL_SOURCE,
        url="https://pvlib-python.readthedocs.io",
        license="BSD-3-Clause (library); peer-reviewed models",
        access_date=_ACCESS,
        unit="W, W/m2, degC",
        notes="Deterministic physics path. See docs/FORMULA_SOURCES.md.",
        verified="verified",
        doc_anchor="src-pvlib-001",
    ),
    "SRC-NSRDB-001": SourceRecord(
        id="SRC-NSRDB-001",
        name="NLR NSRDB (satellite-derived historical irradiance; ex-NREL)",
        type="weather",
        classification=OFFICIAL_SOURCE,
        url="https://developer.nlr.gov/docs/solar/nsrdb/",
        license="Free with developer key (registered at developer.nlr.gov/signup)",
        access_date=_ACCESS,
        unit="irradiance W/m2 (GHI/DNI/DHI); temp C; wind m/s; pressure hPa",
        fields={
            "ghi_w_m2": "ghi",
            "dni_w_m2": "dni",
            "dhi_w_m2": "dhi",
            "temperature_c": "air_temperature",
            "wind_speed_mps": "wind_speed",
            "pressure_hpa": "surface_pressure",
        },
        notes="HISTORICAL only (no forecast): satellite-derived hourly data. India coverage "
        "via suny-india (2000-2014) and himawari (2016-2020) + himawari-tmy. Live-verified "
        "2026-08-26 with a real Bengaluru POINT(77.59 12.97) download (8760 rows). NOTE: the "
        "laboratory was renamed NREL->NLR and nrel.gov now NXDOMAINs; use developer.nlr.gov. "
        "Requires NREL_API_KEY env var.",
        verified="verified",
        doc_anchor="src-nsrdb-001",
    ),
    "SRC-NASA-POWER-001": SourceRecord(
        id="SRC-NASA-POWER-001",
        name="NASA POWER (reserved future provider)",
        type="weather",
        classification=OFFICIAL_SOURCE,
        url="https://power.larc.nasa.gov",
        license="Free (NASA POWER terms)",
        access_date=_ACCESS,
        notes="Provider slot reserved; not yet wired.",
        verified="pending",
        doc_anchor="",
    ),
    "SRC-SOLCAST-001": SourceRecord(
        id="SRC-SOLCAST-001",
        name="Solcast (reserved future provider)",
        type="weather",
        classification=OFFICIAL_SOURCE,
        url="https://solcast.com",
        license="Commercial (API key required)",
        access_date=_ACCESS,
        notes="Provider slot reserved; requires API key.",
        verified="pending",
        doc_anchor="",
    ),
}


def get_source(source_id: str) -> SourceRecord | None:
    return SOURCES.get(source_id)


def list_sources(type_filter: str | None = None) -> list[SourceRecord]:
    values = list(SOURCES.values())
    if type_filter:
        values = [s for s in values if s.type == type_filter]
    return values


def cite(*source_ids: str) -> list[dict]:
    """Build a prediction-response `sources[]` array from source IDs."""
    out: list[dict] = []
    for sid in source_ids:
        rec = SOURCES.get(sid)
        if rec is None:
            continue
        out.append(
            {
                "id": rec.id,
                "name": rec.name,
                "type": rec.type,
                "classification": rec.classification,
                "reference": rec.url,
            }
        )
    return out
