"""Tests for build_quiz_data.py"""
import sys
import os
import tempfile

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
from build_quiz_data import (
    make_id, get_region_field,
    aggregate_countries, aggregate_regions, aggregate_producers, aggregate_varietals,
    build_unified_json,
)


# ═══════════════════════════════════════════════════════
# make_id tests
# ═══════════════════════════════════════════════════════

def test_make_id_basic():
    assert make_id("France") == "france"
    assert make_id("Château Margaux") == "chateau_margaux"
    assert make_id("Côtes du Rhône") == "cotes_du_rhone"
    assert make_id("Domaine de la Romanée-Conti") == "domaine_de_la_romanee_conti"
    assert make_id("F.X. Pichler") == "f_x_pichler"
    assert make_id("Grüner Veltliner") == "gruner_veltliner"


def test_make_id_edge_cases():
    assert make_id("  Napa Valley  ") == "napa_valley"
    assert make_id("Côte-Rôtie") == "cote_rotie"
    assert make_id("Joh. Jos. Prüm") == "joh_jos_prum"
    assert make_id("") == ""
    assert make_id("US") == "us"


# ═══════════════════════════════════════════════════════
# Country aggregation tests
# ═══════════════════════════════════════════════════════

def test_aggregate_countries():
    df = pd.DataFrame({
        'country': ['France'] * 150 + ['Italy'] * 120 + ['Atlantis'] * 5,
        'points': [88] * 150 + [87] * 120 + [90] * 5,
    })
    countries = aggregate_countries(df, min_reviews=100)

    assert len(countries) == 2
    france = next(c for c in countries if c['name'] == 'France')
    assert france['id'] == 'france'
    assert france['world'] == 'old'
    assert france['reviewCount'] == 150
    assert france['avgRating'] == 88.0

    italy = next(c for c in countries if c['name'] == 'Italy')
    assert italy['world'] == 'old'
    assert italy['reviewCount'] == 120


def test_aggregate_countries_old_new_world():
    df = pd.DataFrame({
        'country': ['US'] * 200 + ['France'] * 200,
        'points': [89] * 400,
    })
    countries = aggregate_countries(df, min_reviews=100)
    us = next(c for c in countries if c['name'] == 'US')
    france = next(c for c in countries if c['name'] == 'France')
    assert us['world'] == 'new'
    assert france['world'] == 'old'


# ═══════════════════════════════════════════════════════
# Region aggregation tests
# ═══════════════════════════════════════════════════════

def test_get_region_field_defaults():
    assert get_region_field("France") == "province"
    assert get_region_field("Germany") == "province"
    assert get_region_field("Portugal") == "province"


def test_get_region_field_overrides():
    assert get_region_field("US") == "region_1"
    assert get_region_field("Australia") == "region_1"
    assert get_region_field("Italy") == "region_1"
    assert get_region_field("Spain") == "region_1"
    assert get_region_field("Argentina") == "region_1"


def test_aggregate_regions_france():
    df = pd.DataFrame({
        'country': ['France'] * 60,
        'province': ['Bordeaux'] * 30 + ['Burgundy'] * 30,
        'region_1': ['Pauillac'] * 15 + ['Saint-Julien'] * 15 +
                     ['Côte de Nuits'] * 15 + ['Côte de Beaune'] * 15,
        'region_2': [''] * 60,
        'variety': ['Cabernet Sauvignon'] * 30 + ['Pinot Noir'] * 30,
        'winery': ['Producer'] * 60,
        'points': [89] * 60,
        'price': [50] * 60,
    })
    qualifying_countries = ['france']
    regions, region_lookup = aggregate_regions(df, qualifying_countries, min_reviews=20)

    assert 'france' in regions
    assert len(regions['france']) == 2
    bordeaux = next(r for r in regions['france'] if r['name'] == 'Bordeaux')
    assert bordeaux['id'] == 'bordeaux'
    assert bordeaux['reviewCount'] == 30

    # Sub-appellations should be in regionLookup
    assert 'pauillac' in region_lookup
    assert region_lookup['pauillac']['regionId'] == 'bordeaux'
    assert region_lookup['pauillac']['country'] == 'france'


def test_aggregate_regions_usa():
    df = pd.DataFrame({
        'country': ['US'] * 60,
        'province': ['California'] * 60,
        'region_1': ['Napa Valley'] * 30 + ['Sonoma'] * 30,
        'region_2': ['Oakville'] * 15 + ['Rutherford'] * 15 +
                     ['Russian River Valley'] * 15 + ['Sonoma Coast'] * 15,
        'variety': ['Cabernet Sauvignon'] * 30 + ['Pinot Noir'] * 30,
        'winery': ['Producer'] * 60,
        'points': [90] * 60,
        'price': [60] * 60,
    })
    qualifying_countries = ['us']
    regions, region_lookup = aggregate_regions(df, qualifying_countries, min_reviews=20)

    assert 'us' in regions
    napa = next(r for r in regions['us'] if r['name'] == 'Napa Valley')
    assert napa['reviewCount'] == 30

    # Oakville sub-appellation should map to Napa Valley
    assert 'oakville' in region_lookup
    assert region_lookup['oakville']['regionId'] == 'napa_valley'


def test_aggregate_regions_fallback():
    """When region_1 is empty for a US wine, fall back to province."""
    df = pd.DataFrame({
        'country': ['US'] * 30,
        'province': ['California'] * 30,
        'region_1': [''] * 30,
        'region_2': [''] * 30,
        'variety': ['Chardonnay'] * 30,
        'winery': ['Generic'] * 30,
        'points': [85] * 30,
        'price': [15] * 30,
    })
    qualifying_countries = ['us']
    regions, _ = aggregate_regions(df, qualifying_countries, min_reviews=20)
    assert 'us' in regions
    cal = next(r for r in regions['us'] if r['name'] == 'California')
    assert cal['reviewCount'] == 30


# ═══════════════════════════════════════════════════════
# Producer aggregation tests
# ═══════════════════════════════════════════════════════

def test_aggregate_producers():
    df = pd.DataFrame({
        'country': ['France'] * 20,
        'province': ['Bordeaux'] * 12 + ['Burgundy'] * 8,
        'region_1': [''] * 20,
        'region_2': [''] * 20,
        'winery': ['Château X'] * 15 + ['Domaine Y'] * 5,
        'variety': ['Cabernet Sauvignon'] * 15 + ['Pinot Noir'] * 5,
        'points': [90] * 12 + [88] * 3 + [91] * 5,
        'price': [50] * 20,
    })
    qualifying_regions = {'bordeaux': 'france', 'burgundy': 'france'}
    producers, producer_lookup = aggregate_producers(
        df, qualifying_regions, min_reviews=3, max_per_region=100
    )

    assert 'bordeaux' in producers
    chateau_x = next(p for p in producers['bordeaux'] if p['name'] == 'Château X')
    assert chateau_x['reviewCount'] == 15

    # Château X should NOT also appear under Burgundy
    if 'burgundy' in producers:
        burgundy_names = [p['name'] for p in producers['burgundy']]
        assert 'Château X' not in burgundy_names


def test_aggregate_producers_min_reviews():
    df = pd.DataFrame({
        'country': ['France'] * 10,
        'province': ['Bordeaux'] * 10,
        'region_1': [''] * 10,
        'region_2': [''] * 10,
        'winery': ['Big Producer'] * 8 + ['Tiny Producer'] * 2,
        'variety': ['Merlot'] * 10,
        'points': [88] * 10,
        'price': [30] * 10,
    })
    qualifying_regions = {'bordeaux': 'france'}
    producers, _ = aggregate_producers(df, qualifying_regions, min_reviews=3, max_per_region=100)
    names = [p['name'] for p in producers.get('bordeaux', [])]
    assert 'Big Producer' in names
    assert 'Tiny Producer' not in names


def test_aggregate_producers_blend_still_counted():
    """Producers whose only variety is a blend should still appear."""
    df = pd.DataFrame({
        'country': ['France'] * 10,
        'province': ['Bordeaux'] * 10,
        'region_1': [''] * 10,
        'region_2': [''] * 10,
        'winery': ['Blend Estate'] * 10,
        'variety': ['Red Blend'] * 10,
        'points': [90] * 10,
        'price': [40] * 10,
    })
    qualifying_regions = {'bordeaux': 'france'}
    producers, _ = aggregate_producers(df, qualifying_regions, min_reviews=3, max_per_region=100)
    names = [p['name'] for p in producers.get('bordeaux', [])]
    assert 'Blend Estate' in names


# ═══════════════════════════════════════════════════════
# Varietal aggregation tests
# ═══════════════════════════════════════════════════════

def test_aggregate_varietals_synonyms():
    df = pd.DataFrame({
        'country': ['France'] * 30 + ['Australia'] * 30,
        'province': ['Rhône Valley'] * 30 + ['South Australia'] * 30,
        'region_1': [''] * 60,
        'region_2': [''] * 60,
        'variety': ['Syrah'] * 30 + ['Shiraz'] * 30,
        'winery': ['Producer'] * 60,
        'points': [89] * 60,
        'price': [40] * 60,
    })
    varietals, varietal_lookup = aggregate_varietals(df, min_reviews=50)

    assert len(varietals) == 1
    syrah = varietals[0]
    assert syrah['name'] == 'Syrah / Shiraz'
    assert syrah['id'] == 'syrah'
    assert syrah['reviewCount'] == 60
    assert syrah['color'] == 'red'

    assert varietal_lookup.get('shiraz') == 'syrah'


def test_aggregate_varietals_excludes_blends():
    df = pd.DataFrame({
        'country': ['France'] * 100,
        'province': ['Bordeaux'] * 100,
        'region_1': [''] * 100,
        'region_2': [''] * 100,
        'variety': ['Red Blend'] * 60 + ['Cabernet Sauvignon'] * 40,
        'winery': ['Producer'] * 100,
        'points': [88] * 100,
        'price': [35] * 100,
    })
    varietals, _ = aggregate_varietals(df, min_reviews=30)
    names = [v['name'] for v in varietals]
    assert 'Red Blend' not in names
    assert any('Cabernet Sauvignon' in n for n in names)


# ═══════════════════════════════════════════════════════
# Integration test
# ═══════════════════════════════════════════════════════

def test_build_unified_json_structure():
    rows = []
    # France: Bordeaux (30 reviews), Burgundy (25 reviews)
    for i in range(30):
        rows.append({
            'country': 'France', 'province': 'Bordeaux',
            'region_1': 'Pauillac' if i < 15 else 'Saint-Julien',
            'region_2': '', 'variety': 'Cabernet Sauvignon',
            'winery': f'Chateau {chr(65 + i % 5)}',
            'title': f'Wine {i}', 'points': 89 + (i % 5), 'price': 50,
        })
    for i in range(25):
        rows.append({
            'country': 'France', 'province': 'Burgundy',
            'region_1': 'Côte de Nuits',
            'region_2': '', 'variety': 'Pinot Noir',
            'winery': f'Domaine {chr(65 + i % 4)}',
            'title': f'Wine {i}', 'points': 90 + (i % 3), 'price': 80,
        })
    # US: Napa Valley (30 reviews)
    for i in range(30):
        rows.append({
            'country': 'US', 'province': 'California',
            'region_1': 'Napa Valley',
            'region_2': 'Oakville' if i < 10 else '',
            'variety': 'Cabernet Sauvignon',
            'winery': f'Winery {chr(65 + i % 6)}',
            'title': f'Wine {i}', 'points': 91 + (i % 4), 'price': 70,
        })
    # Small country that should be filtered out
    for i in range(5):
        rows.append({
            'country': 'Atlantis', 'province': 'Deep',
            'region_1': '', 'region_2': '', 'variety': 'Merlot',
            'winery': 'Sunken',
            'title': f'Wine {i}', 'points': 85, 'price': 10,
        })

    df = pd.DataFrame(rows)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        df.to_csv(f, index=False)
        csv_path = f.name

    try:
        result = build_unified_json(
            csv_path,
            min_country_reviews=20, min_region_reviews=20,
            min_producer_reviews=3, min_varietal_reviews=20,
            max_producers_per_region=100,
        )

        # Check top-level structure
        assert 'countries' in result
        assert 'regions' in result
        assert 'producers' in result
        assert 'varietals' in result
        assert 'regionLookup' in result
        assert 'producerLookup' in result
        assert 'varietalLookup' in result
        assert 'metadata' in result

        # Atlantis should be filtered (only 5 reviews)
        country_names = [c['name'] for c in result['countries']]
        assert 'Atlantis' not in country_names
        assert 'France' in country_names
        assert 'US' in country_names

        # France should have regions
        assert 'france' in result['regions']

        # US should use region_1 (Napa Valley), not province (California)
        assert 'us' in result['regions']
        us_region_names = [r['name'] for r in result['regions']['us']]
        assert 'Napa Valley' in us_region_names

        # Metadata should have counts
        assert result['metadata']['countryCount'] >= 2
    finally:
        os.unlink(csv_path)
