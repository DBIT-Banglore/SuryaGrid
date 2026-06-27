"""Tests for the Karnataka solar site registry and to_site_payload helper."""

from app.data.karnataka_sites import KARNATAKA_SITES, to_site_payload

# Karnataka geographic bounding box (rough)
_LAT_MIN, _LAT_MAX = 11.5, 18.5
_LON_MIN, _LON_MAX = 74.0, 78.5

_REQUIRED_FIELDS = {"name", "latitude", "longitude", "capacity_mw", "tilt", "region", "discom"}
_PAYLOAD_REQUIRED = {"name", "latitude", "longitude", "timezone", "capacity_mw", "tilt",
                     "azimuth", "allowed_dsm_threshold_percent", "penalty_rate_per_mwh"}


def test_site_count():
    assert len(KARNATAKA_SITES) == 6


def test_all_sites_have_required_fields():
    for site in KARNATAKA_SITES:
        missing = _REQUIRED_FIELDS - set(site.keys())
        assert not missing, f"Site '{site.get('name')}' missing fields: {missing}"


def test_site_names_are_unique():
    names = [s["name"] for s in KARNATAKA_SITES]
    assert len(names) == len(set(names)), "Duplicate site names found"


def test_coordinates_within_karnataka_bounds():
    for site in KARNATAKA_SITES:
        name = site["name"]
        assert _LAT_MIN <= site["latitude"] <= _LAT_MAX, f"{name}: latitude out of Karnataka bounds"
        assert _LON_MIN <= site["longitude"] <= _LON_MAX, f"{name}: longitude out of Karnataka bounds"


def test_capacities_are_positive():
    for site in KARNATAKA_SITES:
        assert site["capacity_mw"] > 0, f"Site '{site['name']}' has non-positive capacity"


def test_tilts_are_valid():
    for site in KARNATAKA_SITES:
        assert 0 <= site["tilt"] <= 90, f"Site '{site['name']}' has invalid tilt {site['tilt']}"


def test_total_capacity_matches_expected():
    # Sum of all known Karnataka sites: 2050 + 150 + 200 + 25 + 40 + 40 = 2505 MW
    total = sum(s["capacity_mw"] for s in KARNATAKA_SITES)
    assert total == 2505.0


def test_bescom_sites_present():
    discoms = {s["discom"] for s in KARNATAKA_SITES}
    assert "BESCOM" in discoms


def test_gescom_sites_present():
    discoms = {s["discom"] for s in KARNATAKA_SITES}
    assert "GESCOM" in discoms


def test_multiple_regions_represented():
    regions = {s["region"] for s in KARNATAKA_SITES}
    assert len(regions) >= 3  # Tumakuru, Bidar, Koppal, Bengaluru Urban, Bengaluru Rural


def test_pavagada_has_highest_capacity():
    pavagada = next(s for s in KARNATAKA_SITES if "Pavagada" in s["name"])
    max_cap = max(s["capacity_mw"] for s in KARNATAKA_SITES)
    assert pavagada["capacity_mw"] == max_cap


# ---------------------------------------------------------------------------
# to_site_payload — fixed KERC parameters
# ---------------------------------------------------------------------------


def test_to_site_payload_has_all_required_keys():
    payload = to_site_payload(KARNATAKA_SITES[0])
    missing = _PAYLOAD_REQUIRED - set(payload.keys())
    assert not missing, f"Payload missing fields: {missing}"


def test_to_site_payload_timezone_is_kolkata():
    for site in KARNATAKA_SITES:
        payload = to_site_payload(site)
        assert payload["timezone"] == "Asia/Kolkata"


def test_to_site_payload_azimuth_is_south():
    # Karnataka panels face south (northern hemisphere)
    for site in KARNATAKA_SITES:
        payload = to_site_payload(site)
        assert payload["azimuth"] == 180.0


def test_to_site_payload_kerc_dsm_band_is_five_percent():
    for site in KARNATAKA_SITES:
        payload = to_site_payload(site)
        assert payload["allowed_dsm_threshold_percent"] == 5.0


def test_to_site_payload_penalty_rate():
    for site in KARNATAKA_SITES:
        payload = to_site_payload(site)
        assert payload["penalty_rate_per_mwh"] == 12000.0


def test_to_site_payload_copies_variable_fields():
    site = KARNATAKA_SITES[0]
    payload = to_site_payload(site)
    assert payload["name"] == site["name"]
    assert payload["latitude"] == site["latitude"]
    assert payload["longitude"] == site["longitude"]
    assert payload["capacity_mw"] == site["capacity_mw"]
    assert payload["tilt"] == site["tilt"]


def test_to_site_payload_does_not_mutate_source():
    site = dict(KARNATAKA_SITES[0])
    original = dict(site)
    to_site_payload(site)
    assert site == original


def test_to_site_payload_for_every_site():
    # Ensure no KeyError for any site in the registry
    for site in KARNATAKA_SITES:
        payload = to_site_payload(site)
        assert payload["name"] == site["name"]


if __name__ == "__main__":
    test_site_count()
    test_all_sites_have_required_fields()
    test_site_names_are_unique()
    test_coordinates_within_karnataka_bounds()
    test_capacities_are_positive()
    test_tilts_are_valid()
    test_total_capacity_matches_expected()
    test_bescom_sites_present()
    test_gescom_sites_present()
    test_multiple_regions_represented()
    test_pavagada_has_highest_capacity()
    test_to_site_payload_has_all_required_keys()
    test_to_site_payload_timezone_is_kolkata()
    test_to_site_payload_azimuth_is_south()
    test_to_site_payload_kerc_dsm_band_is_five_percent()
    test_to_site_payload_penalty_rate()
    test_to_site_payload_copies_variable_fields()
    test_to_site_payload_does_not_mutate_source()
    test_to_site_payload_for_every_site()
    print("All Karnataka sites tests PASSED")