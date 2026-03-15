# Unified Data Architecture Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-data-world architecture (hand-curated `wineData.js` + WineMag `wineReference-lookup.json`) with a single unified data source (`wineUnified.json`) generated from the WineMag 130k CSV.

**Architecture:** A Python build script processes the WineMag CSV into a single JSON file that replaces both existing data sources. The quiz, profile engine, and match engine all read from this one file. Three mapping dictionaries in matchEngine.js are eliminated because IDs are now shared across all systems.

**Tech Stack:** Python 3 (pandas, unicodedata), Next.js 14, Supabase (Postgres)

**Spec:** `/Users/epgoodwinjr/Downloads/unified-data-architecture-spec.md`

---

## Pre-requisites

Before starting implementation:

- [ ] Ensure `data/external/winemag-data-130k-v2.csv` exists. If not, download/place the WineMag 130k CSV there. The build script depends on this file.
- [ ] Ensure Python 3 with `pandas` is available: `pip install pandas`
- [ ] Create the `data/external/` directory: `mkdir -p data/external`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `scripts/build_quiz_data.py` | Processes WineMag CSV → generates `wineUnified.json` |
| `src/lib/wineUnified.json` | Single unified data source for quiz, profile, matching (GENERATED — do not hand-edit) |
| `tests/test_build_quiz_data.py` | Tests for the build script's core functions |

### Modified Files
| File | Changes |
|------|---------|
| `src/components/Quiz.js` (476 lines) | Rewrite to read from `wineUnified.json`. Add Old/New World grouping, progressive disclosure ("Show more"), dynamic varietal reranking, color grouping. |
| `src/lib/profileEngine.js` (406 lines) | Replace `wineData.js` imports with `wineUnified.json`. Simplify archetype engine to 5 buckets. Update WINE_RECS IDs. |
| `src/lib/matchEngine.js` (759 lines) | Delete 3 mapping dictionaries. Replace dual imports with `wineUnified.json`. Simplify `scoreEntry` to use unified IDs directly. |

### Deleted Files
| File | Reason |
|------|--------|
| `src/lib/wineData.js` (1,236 lines) | Replaced by `wineUnified.json` |
| `src/lib/wineReference-lookup.json` (252 KB) | Merged into `wineUnified.json` |
| `scripts/build_wine_reference.py` (261 lines) | Replaced by `scripts/build_quiz_data.py` |

---

## Chunk 1: Build Script (`scripts/build_quiz_data.py`)

This is the foundation. Nothing else can proceed until this script produces correct output. The build script processes the WineMag 130k CSV and generates `src/lib/wineUnified.json`.

### Task 1.1: Core Utilities — ID Generation and Constants

**Files:**
- Create: `scripts/build_quiz_data.py`
- Create: `tests/test_build_quiz_data.py`

- [ ] **Step 1: Write test for `make_id()` function**

```python
# tests/test_build_quiz_data.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
from build_quiz_data import make_id

def test_make_id_basic():
    assert make_id("France") == "france"
    assert make_id("Château Margaux") == "chateau_margaux"
    assert make_id("Côtes du Rhône") == "cotes_du_rhone"
    assert make_id("Domaine de la Romanée-Conti") == "domaine_de_la_romanee_conti"
    assert make_id("F.X. Pichler") == "fx_pichler"
    assert make_id("Grüner Veltliner") == "gruner_veltliner"

def test_make_id_edge_cases():
    assert make_id("  Napa Valley  ") == "napa_valley"
    assert make_id("Côte-Rôtie") == "cote_rotie"
    assert make_id("Joh. Jos. Prüm") == "joh_jos_prum"
    assert make_id("") == ""
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/epgoodwinjr/Projects/sommeasy-website && python -m pytest tests/test_build_quiz_data.py::test_make_id_basic -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'build_quiz_data'`

- [ ] **Step 3: Write `make_id()` and constants in `scripts/build_quiz_data.py`**

```python
#!/usr/bin/env python3
"""
build_quiz_data.py — Processes WineMag 130k CSV into wineUnified.json

Usage:
    python scripts/build_quiz_data.py data/external/winemag-data-130k-v2.csv src/lib/wineUnified.json
"""

import sys
import json
import unicodedata
import re
from collections import defaultdict

# ═══════════════════════════════════════════════════════
# THRESHOLDS — tune these to control what makes it into the quiz
# ═══════════════════════════════════════════════════════

MIN_COUNTRY_REVIEWS = 100
MIN_REGION_REVIEWS = 20
MIN_PRODUCER_REVIEWS = 3
MIN_VARIETAL_REVIEWS = 50
MAX_PRODUCERS_PER_REGION = 100

# ═══════════════════════════════════════════════════════
# CONSTANTS
# ═══════════════════════════════════════════════════════

OLD_WORLD = {
    "France", "Italy", "Spain", "Portugal", "Germany", "Austria",
    "Greece", "Hungary", "Croatia", "Slovenia", "Georgia",
    "Romania", "Bulgaria", "Lebanon", "Israel", "Turkey",
    "Czech Republic", "Slovakia", "Switzerland", "Luxembourg",
    "Moldova", "Cyprus", "England",
}

NEW_WORLD = {
    "US", "Argentina", "Chile", "Australia", "New Zealand",
    "South Africa", "Brazil", "Uruguay", "Canada", "Mexico",
    "China", "India", "Japan",
}

COUNTRY_EMOJI = {
    "France": "🇫🇷", "Italy": "🇮🇹", "Spain": "🇪🇸", "US": "🇺🇸",
    "Argentina": "🇦🇷", "Chile": "🇨🇱", "Australia": "🇦🇺",
    "South Africa": "🇿🇦", "Portugal": "🇵🇹", "Germany": "🇩🇪",
    "Austria": "🇦🇹", "New Zealand": "🇳🇿", "Greece": "🇬🇷",
    "Hungary": "🇭🇺", "Croatia": "🇭🇷", "Slovenia": "🇸🇮",
    "Georgia": "🇬🇪", "Romania": "🇷🇴", "Bulgaria": "🇧🇬",
    "Lebanon": "🇱🇧", "Israel": "🇮🇱", "Turkey": "🇹🇷",
    "Brazil": "🇧🇷", "Uruguay": "🇺🇾", "Canada": "🇨🇦",
    "Mexico": "🇲🇽", "China": "🇨🇳", "India": "🇮🇳",
    "Japan": "🇯🇵", "Switzerland": "🇨🇭", "Luxembourg": "🇱🇺",
    "Czech Republic": "🇨🇿", "Slovakia": "🇸🇰", "Moldova": "🇲🇩",
    "Cyprus": "🇨🇾", "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
}

# Which WineMag field to use as the primary region for each country.
# Countries not listed here default to "province".
REGION_FIELD_OVERRIDE = {
    "US": "region_1",
    "Australia": "region_1",
}

VARIETAL_SYNONYMS = {
    "Shiraz": "Syrah",
    "Garnacha": "Grenache",
    "Pinot Gris": "Pinot Grigio",
    "Pinot Bianco": "Pinot Blanc",
    "Grauburgunder": "Pinot Grigio",
    "Weissburgunder": "Pinot Blanc",
    "Spätburgunder": "Pinot Noir",
    "Blaufränkisch": "Lemberger",
    "Garnacha Blanca": "Grenache Blanc",
    "Pinot Nero": "Pinot Noir",
    "Tinta de Toro": "Tempranillo",
    "Tinto Fino": "Tempranillo",
    "Sangiovese Grosso": "Sangiovese",
    "Prugnolo Gentile": "Sangiovese",
    "Brunello": "Sangiovese",
    "Monastrell": "Mourvèdre",
    "Sémillon": "Semillon",
    "Albariño": "Albarino",
    "Grüner Veltliner": "Gruner Veltliner",
    "Gewürztraminer": "Gewurztraminer",
    "Melon": "Muscadet",
}

VARIETAL_DISPLAY_NAMES = {
    "Syrah": "Syrah / Shiraz",
    "Grenache": "Grenache / Garnacha",
    "Pinot Grigio": "Pinot Grigio / Pinot Gris",
    "Pinot Blanc": "Pinot Blanc / Pinot Bianco",
    "Mourvèdre": "Mourvèdre / Monastrell",
}

# Color classification for varietals
VARIETAL_COLORS = {
    "Cabernet Sauvignon": "red", "Merlot": "red", "Pinot Noir": "red",
    "Syrah": "red", "Malbec": "red", "Tempranillo": "red",
    "Sangiovese": "red", "Nebbiolo": "red", "Grenache": "red",
    "Zinfandel": "red", "Pinotage": "red", "Mourvèdre": "red",
    "Cabernet Franc": "red", "Petit Verdot": "red", "Gamay": "red",
    "Barbera": "red", "Dolcetto": "red", "Carmenère": "red",
    "Petite Sirah": "red", "Mencia": "red", "Aglianico": "red",
    "Corvina": "red", "Nero d'Avola": "red", "Primitivo": "red",
    "Touriga Nacional": "red", "Lemberger": "red", "Tannat": "red",
    "Carignan": "red", "Cinsault": "red", "País": "red",
    "Chardonnay": "white", "Sauvignon Blanc": "white", "Riesling": "white",
    "Pinot Grigio": "white", "Chenin Blanc": "white", "Viognier": "white",
    "Gruner Veltliner": "white", "Albarino": "white", "Gewurztraminer": "white",
    "Semillon": "white", "Muscadet": "white", "Vermentino": "white",
    "Pinot Blanc": "white", "Marsanne": "white", "Roussanne": "white",
    "Torrontés": "white", "Fiano": "white", "Falanghina": "white",
    "Greco": "white", "Garganega": "white", "Trebbiano": "white",
    "Verdejo": "white", "Godello": "white", "Grenache Blanc": "white",
    "Assyrtiko": "white", "Moscato": "white",
}


# ═══════════════════════════════════════════════════════
# ID GENERATION
# ═══════════════════════════════════════════════════════

def make_id(name):
    """Convert a display name to a stable, deterministic ID.

    'Château Margaux' → 'chateau_margaux'
    'Côtes du Rhône' → 'cotes_du_rhone'
    """
    if not name:
        return ""
    # Normalize unicode (é → e, ü → u)
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    # Lowercase
    s = s.lower()
    # Replace spaces, hyphens, apostrophes, periods with underscores
    s = re.sub(r"[\s\-'\"\.]+", "_", s)
    # Strip non-alphanumeric except underscores
    s = re.sub(r"[^a-z0-9_]", "", s)
    # Collapse multiple underscores
    s = re.sub(r"_+", "_", s)
    # Strip leading/trailing underscores
    s = s.strip("_")
    return s
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/epgoodwinjr/Projects/sommeasy-website && python -m pytest tests/test_build_quiz_data.py -v`
Expected: PASS for all `test_make_id_*` tests

- [ ] **Step 5: Commit**

```bash
git add scripts/build_quiz_data.py tests/test_build_quiz_data.py
git commit -m "feat: add build script skeleton with make_id() and constants"
```

---

### Task 1.2: CSV Loading and Country Aggregation

**Files:**
- Modify: `scripts/build_quiz_data.py`
- Modify: `tests/test_build_quiz_data.py`

- [ ] **Step 1: Write test for country aggregation**

```python
# Add to tests/test_build_quiz_data.py
import pandas as pd
from build_quiz_data import aggregate_countries

def test_aggregate_countries():
    """Test country aggregation with threshold filtering."""
    df = pd.DataFrame({
        'country': ['France'] * 150 + ['Italy'] * 120 + ['Atlantis'] * 5,
        'points': [88] * 150 + [87] * 120 + [90] * 5,
    })
    countries = aggregate_countries(df, min_reviews=100)

    assert len(countries) == 2  # Atlantis filtered out (only 5 reviews)
    france = next(c for c in countries if c['name'] == 'France')
    assert france['id'] == 'france'
    assert france['emoji'] == '🇫🇷'
    assert france['world'] == 'old'
    assert france['reviewCount'] == 150
    assert france['avgRating'] == 88.0

    italy = next(c for c in countries if c['name'] == 'Italy')
    assert italy['world'] == 'old'
    assert italy['reviewCount'] == 120

def test_aggregate_countries_old_new_world():
    """Verify Old World / New World classification."""
    df = pd.DataFrame({
        'country': ['US'] * 200 + ['France'] * 200,
        'points': [89] * 400,
    })
    countries = aggregate_countries(df, min_reviews=100)
    us = next(c for c in countries if c['name'] == 'US')
    france = next(c for c in countries if c['name'] == 'France')
    assert us['world'] == 'new'
    assert france['world'] == 'old'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_build_quiz_data.py::test_aggregate_countries -v`
Expected: FAIL — `ImportError: cannot import name 'aggregate_countries'`

- [ ] **Step 3: Implement `load_csv()` and `aggregate_countries()`**

Add to `scripts/build_quiz_data.py`:

```python
import pandas as pd

def load_csv(csv_path):
    """Load WineMag CSV, return DataFrame with relevant columns."""
    df = pd.read_csv(csv_path, usecols=[
        'country', 'province', 'region_1', 'region_2',
        'variety', 'winery', 'title', 'points', 'price',
    ])
    # Drop rows with no country
    df = df.dropna(subset=['country'])
    # Fill NaN for optional columns
    df['province'] = df['province'].fillna('')
    df['region_1'] = df['region_1'].fillna('')
    df['region_2'] = df['region_2'].fillna('')
    df['variety'] = df['variety'].fillna('')
    df['winery'] = df['winery'].fillna('')
    df['points'] = pd.to_numeric(df['points'], errors='coerce').fillna(0)
    df['price'] = pd.to_numeric(df['price'], errors='coerce').fillna(0)
    return df


def aggregate_countries(df, min_reviews=MIN_COUNTRY_REVIEWS):
    """Aggregate country-level statistics, filter by minimum review count."""
    grouped = df.groupby('country').agg(
        reviewCount=('country', 'size'),
        avgRating=('points', 'mean'),
    ).reset_index()

    # Filter by threshold
    grouped = grouped[grouped['reviewCount'] >= min_reviews]

    countries = []
    for _, row in grouped.iterrows():
        name = row['country']
        world = 'old' if name in OLD_WORLD else ('new' if name in NEW_WORLD else 'unknown')
        countries.append({
            'id': make_id(name),
            'name': name,
            'emoji': COUNTRY_EMOJI.get(name, '🏳️'),
            'world': world,
            'reviewCount': int(row['reviewCount']),
            'avgRating': round(float(row['avgRating']), 1),
        })

    # Sort by reviewCount descending
    countries.sort(key=lambda c: c['reviewCount'], reverse=True)
    return countries
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_build_quiz_data.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/build_quiz_data.py tests/test_build_quiz_data.py
git commit -m "feat: add CSV loading and country aggregation"
```

---

### Task 1.3: Region Aggregation with Country-Specific Field Logic

**Files:**
- Modify: `scripts/build_quiz_data.py`
- Modify: `tests/test_build_quiz_data.py`

This is the most critical aggregation logic. USA and Australia use `region_1` as the quiz region (because their `province` is just the state), while France and Italy use `province`. The function must also compute `topVarietals` per region and build the sub-appellation `regionLookup`.

- [ ] **Step 1: Write tests for region aggregation**

```python
# Add to tests/test_build_quiz_data.py
from build_quiz_data import aggregate_regions, get_region_field

def test_get_region_field_defaults():
    """Most countries use 'province' as the region field."""
    assert get_region_field("France") == "province"
    assert get_region_field("Italy") == "province"
    assert get_region_field("Spain") == "province"

def test_get_region_field_overrides():
    """US and Australia use 'region_1' because province is just the state."""
    assert get_region_field("US") == "region_1"
    assert get_region_field("Australia") == "region_1"

def test_aggregate_regions_france():
    """France uses province as region. Should group by province."""
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
    """US uses region_1 as region (not province, which is just the state)."""
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
    # Should fall back to "California" as region
    cal = next(r for r in regions['us'] if r['name'] == 'California')
    assert cal['reviewCount'] == 30
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_build_quiz_data.py::test_aggregate_regions_france -v`
Expected: FAIL — `ImportError`

- [ ] **Step 3: Implement `get_region_field()` and `aggregate_regions()`**

Add to `scripts/build_quiz_data.py`:

```python
def get_region_field(country):
    """Return which WineMag field to use as the primary region for a country."""
    return REGION_FIELD_OVERRIDE.get(country, "province")


def _get_primary_region(row):
    """Determine the primary region name for a given row, based on country-specific rules."""
    country = row['country']
    field = get_region_field(country)
    value = row.get(field, '')
    # Fall back to province if the override field is empty
    if not value and field != 'province':
        value = row.get('province', '')
    return value if value else None


def aggregate_regions(df, qualifying_country_ids, min_reviews=MIN_REGION_REVIEWS):
    """Aggregate regions per country. Returns (regions_dict, region_lookup).

    regions_dict: { country_id: [{ id, name, province, reviewCount, avgRating, producerCount, topVarietals }] }
    region_lookup: { sub_appellation_key: { regionId, country } }
    """
    regions_dict = {}
    region_lookup = {}

    # Map country names to IDs for filtering
    country_id_to_name = {}
    for _, row in df.drop_duplicates('country').iterrows():
        cid = make_id(row['country'])
        if cid in qualifying_country_ids:
            country_id_to_name[cid] = row['country']
    name_to_id = {v: k for k, v in country_id_to_name.items()}

    for country_id, country_name in country_id_to_name.items():
        country_df = df[df['country'] == country_name].copy()
        country_df['_primary_region'] = country_df.apply(_get_primary_region, axis=1)
        country_df = country_df.dropna(subset=['_primary_region'])
        country_df = country_df[country_df['_primary_region'] != '']

        # Group by primary region
        grouped = country_df.groupby('_primary_region')

        region_list = []
        for region_name, group in grouped:
            if len(group) < min_reviews:
                continue

            region_id = make_id(region_name)
            avg_rating = round(float(group['points'].mean()), 1)
            producer_count = group['winery'].nunique()

            # Top 5 varietals by review count (excluding blends)
            non_blend = group[~group['variety'].str.contains(r'Blend|-', na=False, regex=True)]
            # Normalize synonyms before counting
            normalized_varieties = non_blend['variety'].map(
                lambda v: VARIETAL_SYNONYMS.get(v, v)
            )
            top_vars = normalized_varieties.value_counts().head(5)
            top_varietal_ids = [make_id(v) for v in top_vars.index]

            region_list.append({
                'id': region_id,
                'name': region_name,
                'province': region_name if get_region_field(country_name) == 'province' else group['province'].mode().iloc[0] if len(group['province'].mode()) > 0 else '',
                'reviewCount': int(len(group)),
                'avgRating': avg_rating,
                'producerCount': producer_count,
                'topVarietals': top_varietal_ids,
            })

            # Build sub-appellation lookup from region_1 and region_2 values
            # that are different from the primary region
            for sub_field in ['region_1', 'region_2']:
                sub_values = group[sub_field].dropna().unique()
                for sv in sub_values:
                    if sv and sv != region_name:
                        sub_key = sv.lower().strip()
                        if sub_key and sub_key not in region_lookup:
                            region_lookup[sub_key] = {
                                'regionId': region_id,
                                'country': country_id,
                            }

            # Also add the primary region name itself to lookup (lowercase)
            primary_key = region_name.lower().strip()
            if primary_key not in region_lookup:
                region_lookup[primary_key] = {
                    'regionId': region_id,
                    'country': country_id,
                }

        # Sort by reviewCount descending
        region_list.sort(key=lambda r: r['reviewCount'], reverse=True)
        if region_list:
            regions_dict[country_id] = region_list

    return regions_dict, region_lookup
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_build_quiz_data.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/build_quiz_data.py tests/test_build_quiz_data.py
git commit -m "feat: add region aggregation with country-specific field logic"
```

---

### Task 1.4: Producer Aggregation

**Files:**
- Modify: `scripts/build_quiz_data.py`
- Modify: `tests/test_build_quiz_data.py`

Producers are assigned to their primary region (most reviews). Each producer appears under exactly one region.

- [ ] **Step 1: Write test for producer aggregation**

```python
# Add to tests/test_build_quiz_data.py
from build_quiz_data import aggregate_producers

def test_aggregate_producers():
    """Producers assigned to region with most reviews."""
    df = pd.DataFrame({
        'country': ['France'] * 20,
        'province': ['Bordeaux'] * 12 + ['Burgundy'] * 8,
        'region_1': [''] * 20,
        'region_2': [''] * 20,
        'winery': ['Château X'] * 12 + ['Château X'] * 3 + ['Domaine Y'] * 5,
        'variety': ['Cabernet Sauvignon'] * 15 + ['Pinot Noir'] * 5,
        'points': [90] * 12 + [88] * 3 + [91] * 5,
        'price': [50] * 20,
    })
    # Château X has 12 in Bordeaux, 3 in Burgundy → assigned to Bordeaux
    qualifying_regions = {'bordeaux': 'france', 'burgundy': 'france'}
    producers, producer_lookup = aggregate_producers(
        df, qualifying_regions,
        min_reviews=3, max_per_region=100
    )

    assert 'bordeaux' in producers
    chateau_x = next(p for p in producers['bordeaux'] if p['name'] == 'Château X')
    assert chateau_x['reviewCount'] == 15  # all reviews, not just Bordeaux
    # Château X should NOT also appear under Burgundy
    if 'burgundy' in producers:
        burgundy_names = [p['name'] for p in producers['burgundy']]
        assert 'Château X' not in burgundy_names

def test_aggregate_producers_min_reviews():
    """Producers with fewer than min_reviews are excluded."""
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_build_quiz_data.py::test_aggregate_producers -v`
Expected: FAIL

- [ ] **Step 3: Implement `aggregate_producers()`**

Add to `scripts/build_quiz_data.py`:

```python
def aggregate_producers(df, qualifying_regions, min_reviews=MIN_PRODUCER_REVIEWS, max_per_region=MAX_PRODUCERS_PER_REGION):
    """Aggregate producers, assign each to primary region (most reviews).

    Args:
        df: Full DataFrame
        qualifying_regions: dict of { region_id: country_id } for all qualifying regions
        min_reviews: minimum reviews for a producer to qualify
        max_per_region: cap producers per region

    Returns:
        (producers_dict, producer_lookup)
        producers_dict: { region_id: [{ id, name, reviewCount, avgRating, topVarietals, rank }] }
        producer_lookup: { normalized_name: { producerId, regionId, country, province } }
    """
    # Build reverse lookup: region_name → region_id
    # We need to map each row to its primary region
    df = df.copy()
    df['_primary_region'] = df.apply(_get_primary_region, axis=1)
    df['_region_id'] = df['_primary_region'].apply(lambda r: make_id(r) if r else None)

    # Filter to only rows whose region is qualifying
    df = df[df['_region_id'].isin(qualifying_regions)]

    # Group by winery to find primary region assignment
    winery_groups = df.groupby('winery')

    # For each winery, find region with most reviews
    winery_assignments = {}
    for winery, group in winery_groups:
        if len(group) < min_reviews:
            continue
        region_counts = group['_region_id'].value_counts()
        primary_region = region_counts.index[0]
        # Tiebreak: highest avg rating
        if len(region_counts) > 1 and region_counts.iloc[0] == region_counts.iloc[1]:
            tied_regions = region_counts[region_counts == region_counts.iloc[0]].index
            best_rating = -1
            for r in tied_regions:
                avg = group[group['_region_id'] == r]['points'].mean()
                if avg > best_rating:
                    best_rating = avg
                    primary_region = r

        winery_assignments[winery] = {
            'regionId': primary_region,
            'country': qualifying_regions[primary_region],
            'province': group['province'].mode().iloc[0] if len(group['province'].mode()) > 0 else '',
            'reviewCount': int(len(group)),
            'avgRating': round(float(group['points'].mean()), 1),
            'topVarietals': _top_varietals(group, 3),
        }

    # Group producers by region and compute composite score + rank
    producers_dict = defaultdict(list)
    for winery, data in winery_assignments.items():
        producers_dict[data['regionId']].append({
            'id': make_id(winery),
            'name': winery,
            'reviewCount': data['reviewCount'],
            'avgRating': data['avgRating'],
            'topVarietals': data['topVarietals'],
        })

    # Compute composite score and rank within each region, then cap
    for region_id in producers_dict:
        prods = producers_dict[region_id]
        if not prods:
            continue
        # Normalize reviewCount and avgRating to 0-100
        max_rc = max(p['reviewCount'] for p in prods)
        min_rc = min(p['reviewCount'] for p in prods)
        rc_range = max_rc - min_rc if max_rc != min_rc else 1
        max_ar = max(p['avgRating'] for p in prods)
        min_ar = min(p['avgRating'] for p in prods)
        ar_range = max_ar - min_ar if max_ar != min_ar else 1

        for p in prods:
            norm_rc = ((p['reviewCount'] - min_rc) / rc_range) * 100
            norm_ar = ((p['avgRating'] - min_ar) / ar_range) * 100
            p['_score'] = norm_rc * 0.6 + norm_ar * 0.4

        prods.sort(key=lambda p: p['_score'], reverse=True)
        for i, p in enumerate(prods):
            p['rank'] = i + 1
            del p['_score']

        # Cap at max_per_region
        producers_dict[region_id] = prods[:max_per_region]

    # Build producer lookup
    producer_lookup = {}
    for winery, data in winery_assignments.items():
        key = winery.lower().strip()
        producer_lookup[key] = {
            'producerId': make_id(winery),
            'regionId': data['regionId'],
            'country': data['country'],
            'province': data['province'],
        }

    return dict(producers_dict), producer_lookup


def _top_varietals(group, n=5):
    """Get top N varietals by review count from a group, excluding blends."""
    non_blend = group[~group['variety'].str.contains(r'Blend|-', na=False, regex=True)]
    normalized = non_blend['variety'].map(lambda v: VARIETAL_SYNONYMS.get(v, v))
    top = normalized.value_counts().head(n)
    return [make_id(v) for v in top.index]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_build_quiz_data.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/build_quiz_data.py tests/test_build_quiz_data.py
git commit -m "feat: add producer aggregation with primary region assignment"
```

---

### Task 1.5: Varietal Aggregation

**Files:**
- Modify: `scripts/build_quiz_data.py`
- Modify: `tests/test_build_quiz_data.py`

- [ ] **Step 1: Write test for varietal aggregation**

```python
# Add to tests/test_build_quiz_data.py
from build_quiz_data import aggregate_varietals

def test_aggregate_varietals_synonyms():
    """Shiraz and Syrah should be merged into one entry."""
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

    # Should be merged under canonical name "Syrah"
    assert len(varietals) == 1
    syrah = varietals[0]
    assert syrah['name'] == 'Syrah / Shiraz'  # Display name with synonym
    assert syrah['id'] == 'syrah'
    assert syrah['reviewCount'] == 60
    assert syrah['color'] == 'red'

    # Varietal lookup should map synonym
    assert varietal_lookup.get('shiraz') == 'syrah'

def test_aggregate_varietals_excludes_blends():
    """Blends should not appear in varietal list."""
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_build_quiz_data.py::test_aggregate_varietals_synonyms -v`
Expected: FAIL

- [ ] **Step 3: Implement `aggregate_varietals()`**

Add to `scripts/build_quiz_data.py`:

```python
def aggregate_varietals(df, min_reviews=MIN_VARIETAL_REVIEWS):
    """Aggregate varietals globally, normalizing synonyms and excluding blends.

    Returns:
        (varietals_list, varietal_lookup)
        varietals_list: [{ id, name, color, reviewCount, avgRating, topRegions }]
        varietal_lookup: { synonym_key: canonical_id }
    """
    # Exclude blends
    non_blend = df[~df['variety'].str.contains(r'Blend|-', na=False, regex=True)].copy()
    non_blend = non_blend[non_blend['variety'] != '']

    # Normalize synonyms
    non_blend['_canonical'] = non_blend['variety'].map(
        lambda v: VARIETAL_SYNONYMS.get(v, v)
    )

    grouped = non_blend.groupby('_canonical')
    varietals = []

    for canonical_name, group in grouped:
        if len(group) < min_reviews:
            continue

        varietal_id = make_id(canonical_name)
        display_name = VARIETAL_DISPLAY_NAMES.get(canonical_name, canonical_name)
        color = VARIETAL_COLORS.get(canonical_name, 'unknown')

        # Top regions by review count
        group_with_region = group.copy()
        group_with_region['_primary_region'] = group_with_region.apply(_get_primary_region, axis=1)
        top_region_names = group_with_region['_primary_region'].dropna().value_counts().head(5)
        top_region_ids = [make_id(r) for r in top_region_names.index if r]

        varietals.append({
            'id': varietal_id,
            'name': display_name,
            'color': color,
            'reviewCount': int(len(group)),
            'avgRating': round(float(group['points'].mean()), 1),
            'topRegions': top_region_ids,
        })

    # Sort by reviewCount descending
    varietals.sort(key=lambda v: v['reviewCount'], reverse=True)

    # Build varietal synonym lookup
    varietal_lookup = {}
    for synonym, canonical in VARIETAL_SYNONYMS.items():
        canonical_id = make_id(canonical)
        synonym_id = make_id(synonym)
        if synonym_id != canonical_id:
            varietal_lookup[synonym_id] = canonical_id
        # Also add lowercase original form
        synonym_lower = synonym.lower().strip()
        varietal_lookup[synonym_lower] = canonical_id

    return varietals, varietal_lookup
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_build_quiz_data.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/build_quiz_data.py tests/test_build_quiz_data.py
git commit -m "feat: add varietal aggregation with synonym normalization"
```

---

### Task 1.6: Main Build Pipeline and JSON Output

**Files:**
- Modify: `scripts/build_quiz_data.py`

This task wires all the aggregation functions together and writes the final JSON output.

- [ ] **Step 1: Write integration test**

```python
# Add to tests/test_build_quiz_data.py
import tempfile, os
from build_quiz_data import build_unified_json

def test_build_unified_json_structure():
    """Integration test: build full JSON from a small synthetic dataset."""
    # Create a minimal but realistic CSV
    rows = []
    # France: Bordeaux (30 reviews), Burgundy (25 reviews)
    for i in range(30):
        rows.append({'country': 'France', 'province': 'Bordeaux', 'region_1': 'Pauillac' if i < 15 else 'Saint-Julien',
                     'region_2': '', 'variety': 'Cabernet Sauvignon', 'winery': f'Chateau {chr(65 + i % 5)}',
                     'title': f'Wine {i}', 'points': 89 + (i % 5), 'price': 50})
    for i in range(25):
        rows.append({'country': 'France', 'province': 'Burgundy', 'region_1': 'Côte de Nuits',
                     'region_2': '', 'variety': 'Pinot Noir', 'winery': f'Domaine {chr(65 + i % 4)}',
                     'title': f'Wine {i}', 'points': 90 + (i % 3), 'price': 80})
    # US: Napa Valley (30 reviews)
    for i in range(30):
        rows.append({'country': 'US', 'province': 'California', 'region_1': 'Napa Valley',
                     'region_2': 'Oakville' if i < 10 else '', 'variety': 'Cabernet Sauvignon',
                     'winery': f'Winery {chr(65 + i % 6)}', 'title': f'Wine {i}',
                     'points': 91 + (i % 4), 'price': 70})
    # Small country that should be filtered out
    for i in range(5):
        rows.append({'country': 'Atlantis', 'province': 'Deep', 'region_1': '',
                     'region_2': '', 'variety': 'Merlot', 'winery': 'Sunken',
                     'title': f'Wine {i}', 'points': 85, 'price': 10})

    df = pd.DataFrame(rows)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        df.to_csv(f, index=False)
        csv_path = f.name

    try:
        result = build_unified_json(csv_path,
            min_country_reviews=20, min_region_reviews=20,
            min_producer_reviews=3, min_varietal_reviews=20,
            max_producers_per_region=100)

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_build_quiz_data.py::test_build_unified_json_structure -v`
Expected: FAIL

- [ ] **Step 3: Implement `build_unified_json()` and `main()`**

Add to `scripts/build_quiz_data.py`:

```python
from datetime import datetime, timezone

def build_unified_json(csv_path, min_country_reviews=MIN_COUNTRY_REVIEWS,
                       min_region_reviews=MIN_REGION_REVIEWS,
                       min_producer_reviews=MIN_PRODUCER_REVIEWS,
                       min_varietal_reviews=MIN_VARIETAL_REVIEWS,
                       max_producers_per_region=MAX_PRODUCERS_PER_REGION):
    """Build the complete unified JSON from a WineMag CSV.

    Returns the JSON-serializable dict.
    """
    df = load_csv(csv_path)
    source_rows = len(df)

    # 1. Countries
    countries = aggregate_countries(df, min_reviews=min_country_reviews)
    qualifying_country_ids = [c['id'] for c in countries]

    # Add regionCount and topVarietals to countries (filled in after region aggregation)
    # We'll update these after computing regions

    # 2. Regions
    regions, region_lookup = aggregate_regions(df, qualifying_country_ids, min_reviews=min_region_reviews)

    # Update country entries with regionCount and topVarietals
    for country in countries:
        cid = country['id']
        country_regions = regions.get(cid, [])
        country['regionCount'] = len(country_regions)
        # Top varietals: merge topVarietals from top 5 regions, deduplicate
        seen = []
        for r in country_regions[:5]:
            for v in r.get('topVarietals', []):
                if v not in seen:
                    seen.append(v)
        country['topVarietals'] = seen[:5]

    # 3. Producers
    # Build qualifying_regions: { region_id: country_id }
    qualifying_regions = {}
    for country_id, region_list in regions.items():
        for r in region_list:
            qualifying_regions[r['id']] = country_id

    producers, producer_lookup = aggregate_producers(
        df, qualifying_regions,
        min_reviews=min_producer_reviews,
        max_per_region=max_producers_per_region
    )

    # 4. Varietals
    varietals, varietal_lookup = aggregate_varietals(df, min_reviews=min_varietal_reviews)

    # 5. Metadata
    metadata = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'sourceRows': source_rows,
        'countryCount': len(countries),
        'regionCount': sum(len(r) for r in regions.values()),
        'producerCount': sum(len(p) for p in producers.values()),
        'varietalCount': len(varietals),
        'minCountryReviews': min_country_reviews,
        'minRegionReviews': min_region_reviews,
        'minProducerReviews': min_producer_reviews,
        'minVarietalReviews': min_varietal_reviews,
    }

    return {
        'countries': countries,
        'regions': regions,
        'producers': producers,
        'varietals': varietals,
        'regionLookup': region_lookup,
        'producerLookup': producer_lookup,
        'varietalLookup': varietal_lookup,
        'metadata': metadata,
    }


def main():
    if len(sys.argv) < 3:
        print("Usage: python scripts/build_quiz_data.py <input.csv> <output.json>")
        sys.exit(1)

    csv_path = sys.argv[1]
    output_path = sys.argv[2]

    print(f"Loading {csv_path}...")
    result = build_unified_json(csv_path)

    print(f"\n=== Build Summary ===")
    meta = result['metadata']
    print(f"Source rows:  {meta['sourceRows']:,}")
    print(f"Countries:    {meta['countryCount']}")
    print(f"Regions:      {meta['regionCount']}")
    print(f"Producers:    {meta['producerCount']}")
    print(f"Varietals:    {meta['varietalCount']}")

    # Print country breakdown for sanity checking
    print(f"\n=== Countries ===")
    for c in result['countries']:
        region_count = len(result['regions'].get(c['id'], []))
        producer_count = sum(len(result['producers'].get(r['id'], [])) for r in result['regions'].get(c['id'], []))
        print(f"  {c['emoji']} {c['name']:20s} reviews={c['reviewCount']:5d}  regions={region_count:3d}  producers={producer_count:4d}")

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {output_path} ({os.path.getsize(output_path):,} bytes)")


if __name__ == '__main__':
    main()
```

Also add `import os` to the top imports if not already present.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_build_quiz_data.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/build_quiz_data.py tests/test_build_quiz_data.py
git commit -m "feat: complete build pipeline with JSON output and summary stats"
```

---

### Task 1.7: Run Build Script Against Real CSV and Sanity-Check

**Files:**
- Uses: `data/external/winemag-data-130k-v2.csv`
- Creates: `src/lib/wineUnified.json`

**IMPORTANT:** This is a manual verification checkpoint. Do NOT proceed to Chunk 2 until the entity counts have been reviewed and confirmed as reasonable.

- [ ] **Step 1: Run the build script against the real CSV**

Run:
```bash
cd /Users/epgoodwinjr/Projects/sommeasy-website
python scripts/build_quiz_data.py data/external/winemag-data-130k-v2.csv src/lib/wineUnified.json
```

Expected output (approximate):
```
=== Build Summary ===
Source rows:  ~129,975
Countries:    ~25-30
Regions:      ~200-350
Producers:    ~3,000-5,000
Varietals:    ~50-60
```

- [ ] **Step 2: Sanity-check the output**

Verify these expected characteristics:
- France should have many regions (Bordeaux, Burgundy, Champagne, Rhône Valley, Loire Valley, Alsace, Provence, Languedoc-Roussillon, Beaujolais, etc.) — **expect 10-20 regions**
- Bordeaux should have many producers — **expect 50+ producers**
- USA should show region_1 names (Napa Valley, Willamette Valley, Sonoma), NOT province names (California, Oregon)
- Pinot Noir, Cabernet Sauvignon, Chardonnay should be in the top varietals
- "Red Blend" and "Bordeaux-style Red Blend" should NOT appear in varietals
- Shiraz and Syrah should be merged as "Syrah / Shiraz"

Run spot-checks:
```bash
python -c "
import json
with open('src/lib/wineUnified.json') as f:
    data = json.load(f)

# Check France regions
print('=== France Regions ===')
for r in data['regions'].get('france', []):
    print(f'  {r[\"name\"]:30s} reviews={r[\"reviewCount\"]}')

# Check US regions (should NOT be California/Oregon)
print('\n=== US Regions ===')
for r in data['regions'].get('us', [])[:15]:
    print(f'  {r[\"name\"]:30s} reviews={r[\"reviewCount\"]}')

# Check top varietals
print('\n=== Top 10 Varietals ===')
for v in data['varietals'][:10]:
    print(f'  {v[\"name\"]:30s} color={v[\"color\"]:6s} reviews={v[\"reviewCount\"]}')

# Check Bordeaux producers
bordeaux_prods = data['producers'].get('bordeaux', [])
print(f'\n=== Bordeaux Producers: {len(bordeaux_prods)} total ===')
for p in bordeaux_prods[:10]:
    print(f'  {p[\"name\"]:30s} reviews={p[\"reviewCount\"]} rank={p[\"rank\"]}')

# Check file size
import os
size = os.path.getsize('src/lib/wineUnified.json')
print(f'\nFile size: {size:,} bytes ({size/1024:.0f} KB)')
"
```

- [ ] **Step 3: If anything looks wrong, fix the build script and re-run**

Common issues to watch for:
- If USA shows "California" instead of "Napa Valley" → the `REGION_FIELD_OVERRIDE` logic is broken
- If France has too few regions → `MIN_REGION_REVIEWS` threshold may be too high
- If Bordeaux has very few producers → `MIN_PRODUCER_REVIEWS` threshold may be too high or the region assignment is wrong
- If varietals include blends → the blend filtering regex is too narrow

- [ ] **Step 4: Commit the generated JSON (but NOT the CSV)**

```bash
echo "data/external/" >> .gitignore  # Don't commit the 130k CSV
git add scripts/build_quiz_data.py src/lib/wineUnified.json .gitignore
git commit -m "feat: generate wineUnified.json from WineMag 130k dataset

Countries: N, Regions: N, Producers: N, Varietals: N"
```

Replace N with actual counts from the build output.

- [ ] **Step 5: CHECKPOINT — Get user confirmation before proceeding**

Share the build summary and spot-check output with the user. Ask: "Do these numbers look right? Should I proceed to the quiz component rewrite?"

---

## Chunk 2: Quiz Component Rewrite

The quiz component is the most user-visible change. It needs to switch from the hardcoded `wineData.js` arrays to the dynamic `wineUnified.json` data, adding Old/New World country grouping, progressive disclosure ("Show more"), and dynamic varietal reranking.

### Task 2.1: Update Quiz Imports and Country Step

**Files:**
- Modify: `src/components/Quiz.js`

- [ ] **Step 1: Replace wineData.js import with wineUnified.json**

In `src/components/Quiz.js`, change line 4:

```javascript
// OLD:
import { COUNTRIES, REGIONS, ESTATES, VARIETALS } from "@/lib/wineData";

// NEW:
import wineUnified from "@/lib/wineUnified.json";
```

- [ ] **Step 2: Rewrite `CountryStep` with Old World / New World grouping**

Replace the `CountryStep` function (lines 90-98):

```javascript
function CountryStep({ selected, onToggle }) {
  const oldWorld = wineUnified.countries
    .filter(c => c.world === "old")
    .sort((a, b) => b.reviewCount - a.reviewCount);
  const newWorld = wineUnified.countries
    .filter(c => c.world === "new")
    .sort((a, b) => b.reviewCount - a.reviewCount);

  return (
    <div>
      <StepHeader number="01" title="Where in the world?" subtitle="Select the countries whose wines you enjoy. Pick as many as you like." />
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#1B3D2F", margin: "0 0 10px 4px", fontWeight: 600, opacity: 0.5 }}>Old World</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", padding: "0 8px" }}>
          {oldWorld.map(c => <Chip key={c.id} label={c.name} emoji={c.emoji} selected={selected.includes(c.id)} onClick={() => onToggle(c.id)} />)}
        </div>
      </div>
      <div>
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#1B3D2F", margin: "0 0 10px 4px", fontWeight: 600, opacity: 0.5 }}>New World</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", padding: "0 8px" }}>
          {newWorld.map(c => <Chip key={c.id} label={c.name} emoji={c.emoji} selected={selected.includes(c.id)} onClick={() => onToggle(c.id)} />)}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the app builds without errors**

Run: `cd /Users/epgoodwinjr/Projects/sommeasy-website && npm run build`
Expected: Build succeeds (other steps may have render issues until they're updated, but no import errors)

- [ ] **Step 4: Commit**

```bash
git add src/components/Quiz.js
git commit -m "feat: quiz country step reads from wineUnified.json with Old/New World grouping"
```

---

### Task 2.2: Region Step with Progressive Disclosure

**Files:**
- Modify: `src/components/Quiz.js`

- [ ] **Step 1: Rewrite `RegionStep` with "Show more" functionality**

Replace the `RegionStep` function (lines 101-113):

```javascript
function RegionStep({ selectedCountries, regions, onToggle }) {
  const INITIAL_SHOW = 12;
  const [expanded, setExpanded] = useState({});

  const items = selectedCountries
    .map(cId => {
      const country = wineUnified.countries.find(c => c.id === cId);
      const regionList = (wineUnified.regions[cId] || [])
        .sort((a, b) => b.reviewCount - a.reviewCount);
      return { id: cId, country, regions: regionList };
    })
    .filter(i => i.regions.length > 0);

  return (
    <div>
      <StepHeader number="02" title="Let's get more specific" subtitle="For each country, do you have favorite regions? Select any you know and love — or skip to like the country broadly." />
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {items.map(item => {
          const isExpanded = expanded[item.id];
          const visibleRegions = isExpanded ? item.regions : item.regions.slice(0, INITIAL_SHOW);
          const hiddenCount = item.regions.length - INITIAL_SHOW;
          const selectedCount = (regions[item.id] || []).length;

          return (
            <div key={item.id}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "16px", color: "#1B3D2F" }}>
                  {item.country.emoji} {item.country.name}
                </span>
                {selectedCount > 0 && (
                  <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#8B2332", fontWeight: 600 }}>{selectedCount} selected</span>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {visibleRegions.map((r, i) => (
                  <Chip
                    key={r.id}
                    label={r.name}
                    selected={(regions[item.id] || []).includes(r.id)}
                    onClick={() => onToggle(item.id, r.id)}
                    small={isExpanded && i >= INITIAL_SHOW}
                  />
                ))}
              </div>
              {hiddenCount > 0 && !isExpanded && (
                <button
                  onClick={() => setExpanded(prev => ({ ...prev, [item.id]: true }))}
                  style={{
                    fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#8B2332",
                    background: "none", border: "none", cursor: "pointer", marginTop: 8,
                    padding: "6px 0", opacity: 0.7,
                  }}
                >
                  ▾ Show {hiddenCount} more regions
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify app builds**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/components/Quiz.js
git commit -m "feat: quiz region step with progressive disclosure (show more)"
```

---

### Task 2.3: Producer (Estate) Step with Pagination

**Files:**
- Modify: `src/components/Quiz.js`

- [ ] **Step 1: Rewrite `EstateStep` with producer pagination**

Replace the `EstateStep` function (lines 116-134):

```javascript
function EstateStep({ selectedCountries, regions, estates, onToggle }) {
  const PRODUCERS_PER_PAGE = 15;
  const [showCounts, setShowCounts] = useState({});

  const items = Object.entries(regions).flatMap(([countryId, regionIds]) =>
    regionIds
      .filter(rId => (wineUnified.producers[rId] || []).length > 0)
      .map(rId => {
        const region = (wineUnified.regions[countryId] || []).find(r => r.id === rId);
        const country = wineUnified.countries.find(c => c.id === countryId);
        const producerList = wineUnified.producers[rId] || [];
        return {
          id: rId,
          region: region || { id: rId, name: rId },
          country: country || { emoji: '', name: '' },
          producerList,
        };
      })
  );

  if (items.length === 0) {
    return (
      <div>
        <StepHeader number="03" title="Favorite producers?" subtitle="We don't have producers listed for your selected regions yet — no worries! You can add specific wines in the next step." />
      </div>
    );
  }

  return (
    <div>
      <StepHeader number="03" title="Any favorite producers?" subtitle="Know specific estates or wineries you love? Select them — totally fine to skip." />
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {items.map(item => {
          const showCount = showCounts[item.id] || PRODUCERS_PER_PAGE;
          const visible = item.producerList.slice(0, showCount);
          const hiddenCount = item.producerList.length - showCount;
          const selectedCount = (estates[item.id] || []).length;

          return (
            <div key={item.id}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "16px", color: "#1B3D2F" }}>
                  {item.country.emoji} {item.region.name}
                </span>
                {selectedCount > 0 && (
                  <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#8B2332", fontWeight: 600 }}>{selectedCount} selected</span>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {visible.map(p => (
                  <Chip
                    key={p.id}
                    label={p.name}
                    selected={(estates[item.id] || []).includes(p.id)}
                    onClick={() => onToggle(item.id, p.id)}
                    small
                  />
                ))}
              </div>
              {hiddenCount > 0 && (
                <button
                  onClick={() => setShowCounts(prev => ({
                    ...prev,
                    [item.id]: (prev[item.id] || PRODUCERS_PER_PAGE) + PRODUCERS_PER_PAGE
                  }))}
                  style={{
                    fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#8B2332",
                    background: "none", border: "none", cursor: "pointer", marginTop: 8,
                    padding: "6px 0", opacity: 0.7,
                  }}
                >
                  ▾ Show {Math.min(hiddenCount, PRODUCERS_PER_PAGE)} more producers
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Note: The `EstateStep` props change — it now receives `selectedCountries` instead of relying on `ESTATES` from wineData. Update the call site in the main quiz:

```javascript
// In the main Quiz component, update step === 2 rendering:
{step === 2 && <EstateStep selectedCountries={answers.countries} regions={answers.regions} estates={answers.estates} onToggle={(rId, eId) => setAnswers(p => ({ ...p, estates: { ...p.estates, [rId]: toggle(p.estates[rId] || [], eId) } }))} />}
```

- [ ] **Step 2: Verify app builds**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/components/Quiz.js
git commit -m "feat: quiz producer step with pagination (show more)"
```

---

### Task 2.4: Varietal Step with Dynamic Reranking and Color Grouping

**Files:**
- Modify: `src/components/Quiz.js`

- [ ] **Step 1: Rewrite `VarietalStep` with dynamic reranking**

Replace the `VarietalStep` function (lines 137-153):

```javascript
function VarietalStep({ selected, onToggle, selectedRegions, selectedEstates }) {
  // Dynamic reranking: score each varietal based on user's selected regions/producers
  const allRegionIds = Object.values(selectedRegions || {}).flat();
  const allEstateIds = Object.values(selectedEstates || {}).flat();

  const scored = wineUnified.varietals.map(v => {
    let relevance = 0;
    // Count how many selected regions list this varietal in topVarietals
    for (const countryId of Object.keys(selectedRegions || {})) {
      for (const rId of (selectedRegions[countryId] || [])) {
        const region = (wineUnified.regions[countryId] || []).find(r => r.id === rId);
        if (region && region.topVarietals && region.topVarietals.includes(v.id)) {
          relevance += 3;
        }
      }
    }
    // Count producers associated with this varietal
    for (const rId of Object.keys(selectedEstates || {})) {
      for (const eId of (selectedEstates[rId] || [])) {
        const producer = (wineUnified.producers[rId] || []).find(p => p.id === eId);
        if (producer && producer.topVarietals && producer.topVarietals.includes(v.id)) {
          relevance += 1;
        }
      }
    }
    return { ...v, relevance };
  });

  const relevant = scored.filter(v => v.relevance > 0).sort((a, b) => b.relevance - a.relevance || b.reviewCount - a.reviewCount);
  const other = scored.filter(v => v.relevance === 0).sort((a, b) => b.reviewCount - a.reviewCount);
  const hasRelevant = relevant.length > 0 && allRegionIds.length > 0;

  const renderGroup = (varietals, label, labelColor) => {
    const reds = varietals.filter(v => v.color === "red");
    const whites = varietals.filter(v => v.color === "white");
    return (
      <div style={{ marginBottom: 20 }}>
        {label && (
          <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.12em", color: labelColor || "#1B3D2F", margin: "0 0 12px 4px", fontWeight: 600, opacity: 0.5 }}>{label}</p>
        )}
        {reds.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#8B2332", margin: "0 0 8px 4px", fontWeight: 600 }}>Red</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {reds.map(v => <Chip key={v.id} label={v.name} color="#8B2332" selected={selected.includes(v.id)} onClick={() => onToggle(v.id)} small />)}
            </div>
          </div>
        )}
        {whites.length > 0 && (
          <div>
            <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#6B8F5E", margin: "0 0 8px 4px", fontWeight: 600 }}>White</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {whites.map(v => <Chip key={v.id} label={v.name} color="#6B8F5E" selected={selected.includes(v.id)} onClick={() => onToggle(v.id)} small />)}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <StepHeader number="04" title="Which grapes do you love?" subtitle="These are your preferences regardless of origin. A Pinot Noir lover is a Pinot Noir lover, whether Burgundy or Oregon." />
      {hasRelevant ? (
        <>
          {renderGroup(relevant, "Based on your selections", "#8B2332")}
          {other.length > 0 && (
            <>
              <div style={{ height: 1, background: "rgba(27,61,47,0.1)", margin: "8px 0 16px" }} />
              {renderGroup(other, "Other varietals")}
            </>
          )}
        </>
      ) : (
        renderGroup(scored.sort((a, b) => b.reviewCount - a.reviewCount), null)
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update the VarietalStep call in the main Quiz component**

The call site needs to pass `selectedRegions` and `selectedEstates`:

```javascript
// Update step === 3 rendering:
{step === 3 && <VarietalStep selected={answers.varietals} onToggle={id => setAnswers(p => ({ ...p, varietals: toggle(p.varietals, id) }))} selectedRegions={answers.regions} selectedEstates={answers.estates} />}
```

- [ ] **Step 3: Verify app builds**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/components/Quiz.js
git commit -m "feat: quiz varietal step with dynamic reranking and color grouping"
```

---

### Task 2.5: Update SpecificWineStep and DNAProfileCard

**Files:**
- Modify: `src/components/Quiz.js`

The SpecificWineStep references `ESTATES` from wineData for producer suggestions. This needs to switch to `wineUnified.producers`.

- [ ] **Step 1: Update `SpecificWineStep` to use unified data**

In the `SpecificWineStep` function, change the estate suggestions derivation (lines 157-162):

```javascript
// OLD:
const estateSuggestions = Object.entries(selectedEstates || {})
  .flatMap(([rId, eIds]) =>
    (ESTATES[rId] || []).filter(e => eIds.includes(e.id)).map(e => e.name)
  )
  .filter(name => !wines.includes(name))
  .slice(0, 8);

// NEW:
const estateSuggestions = Object.entries(selectedEstates || {})
  .flatMap(([rId, eIds]) =>
    (wineUnified.producers[rId] || []).filter(e => eIds.includes(e.id)).map(e => e.name)
  )
  .filter(name => !wines.includes(name))
  .slice(0, 8);
```

- [ ] **Step 2: Verify no other references to `COUNTRIES`, `REGIONS`, `ESTATES`, or `VARIETALS` remain in Quiz.js**

Search for any remaining references to the old wineData imports and replace them:

```javascript
// Any remaining COUNTRIES references → wineUnified.countries
// Any remaining REGIONS references → wineUnified.regions
// Any remaining ESTATES references → wineUnified.producers
// Any remaining VARIETALS references → wineUnified.varietals
```

Key places to check:
- `RegionStep`: already updated in Task 2.2
- `EstateStep`: already updated in Task 2.3
- `VarietalStep`: already updated in Task 2.4
- `DNAProfileCard`: should not need changes (it receives a profile object, doesn't import data directly)

- [ ] **Step 3: Verify app builds**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/components/Quiz.js
git commit -m "feat: complete quiz component migration to wineUnified.json"
```

---

## Chunk 3: Profile Engine and Match Engine Updates

### Task 3.1: Rewrite profileEngine.js — Imports and Name Resolution

**Files:**
- Modify: `src/lib/profileEngine.js`

- [ ] **Step 1: Replace wineData import with wineUnified**

Change line 1 of `src/lib/profileEngine.js`:

```javascript
// OLD:
import { COUNTRIES, REGIONS, ESTATES, VARIETALS } from "./wineData";

// NEW:
import wineUnified from "./wineUnified.json";
```

- [ ] **Step 2: Update name resolution in `generateDNAProfile()`**

Replace the name resolution block (lines 284-309):

```javascript
// ─── Resolve names from IDs ───
const countryObjs = countries.map(id => wineUnified.countries.find(c => c.id === id)).filter(Boolean);
const countryNames = countryObjs.map(c => c.name);
const oldWorld = countryObjs.filter(c => c.world === "old").length;
const newWorld = countryObjs.filter(c => c.world === "new").length;

const allRegionIds = Object.values(regions).flat();
const regionNames = allRegionIds.map(rId => {
  for (const regionList of Object.values(wineUnified.regions)) {
    const f = regionList.find(r => r.id === rId);
    if (f) return f.name;
  }
  return null;
}).filter(Boolean);

const allEstateIds = Object.values(estates).flat();
const estateNames = allEstateIds.map(eId => {
  for (const prodList of Object.values(wineUnified.producers)) {
    const f = prodList.find(e => e.id === eId);
    if (f) return f.name;
  }
  return null;
}).filter(Boolean);

const varietalNames = varietals.map(id => {
  const v = wineUnified.varietals.find(v => v.id === id);
  return v ? v.name : null;
}).filter(Boolean);
const reds = varietals.filter(id => {
  const v = wineUnified.varietals.find(v => v.id === id);
  return v && v.color === "red";
});
const whites = varietals.filter(id => {
  const v = wineUnified.varietals.find(v => v.id === id);
  return v && v.color === "white";
});
```

- [ ] **Step 3: Update the `concentration` computation** (lines 319-341)

Replace the topCountryRegions resolution:

```javascript
if (topCountryId) {
  const cObj = wineUnified.countries.find(c => c.id === topCountryId);
  const topCountry = cObj ? cObj.name : null;
  topCountryRegions = (regions[topCountryId] || []).map(rId => {
    for (const regionList of Object.values(wineUnified.regions)) {
      const f = regionList.find(r => r.id === rId);
      if (f) return f.name;
    }
    return null;
  }).filter(Boolean);
  concentration = regionCount > 0 ? concentration / regionCount : 0;
}

const topCountryObj = topCountryId ? wineUnified.countries.find(c => c.id === topCountryId) : null;
const topCountry = topCountryObj ? topCountryObj.name : null;
```

- [ ] **Step 4: Verify app builds**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/lib/profileEngine.js
git commit -m "feat: profileEngine reads from wineUnified.json"
```

---

### Task 3.2: Simplify Archetype Engine

**Files:**
- Modify: `src/lib/profileEngine.js`

Per spec section 4B: replace the 15-archetype `determineArchetype()` with 5 broad buckets. The existing archetype engine uses `VARIETALS` from wineData to filter red/white varietals in narrative text (lines 219-231). This needs updating too.

- [ ] **Step 1: Replace the `determineArchetype` function (lines 112-273)**

```javascript
function determineArchetype(ctx) {
  // Simplified placeholder — 5 broad buckets based on selection breadth/depth
  // Full archetype engine redesign is a future feature
  const {
    breadth, depth, varietalCount,
    countryNames, regionNames, varietalNames, estateNames,
  } = ctx;

  function generateNarrative(archetype) {
    const countries = countryNames.length > 0 ? joinList(countryNames, 3) : "the wine world";
    const grapes = varietalNames.length > 0 ? joinList(varietalNames, 3) : "many grapes";
    const regions = regionNames.length > 0 ? joinList(regionNames, 3) : "";

    switch (archetype) {
      case "The Grand Palate":
        return `This is the palate of someone who has been everywhere and remembers everything. ${countries}${countryNames.length > 3 ? " and beyond" : ""} — you navigate them all with fluency. ${regions ? `From ${regions}, ` : ""}your knowledge of ${grapes} across the globe shows a truly expansive palate. The restaurant sommelier isn't telling you what to drink. You're telling them.`;
      case "The Connoisseur":
        return `You've moved past "I like red wine" a long time ago. Your palate is calibrated across ${countries}, with a deep appreciation for ${grapes}.${regions ? ` Regions like ${regions} matter to you, and that's the sign of a serious wine drinker.` : ""} You know exactly what you want from each glass.`;
      case "The Explorer":
        return `Your palate doesn't sit still. ${countries} are all on your radar, and you're drawn to variety and new discoveries.${varietalNames.length > 0 ? ` ${joinList(varietalNames, 2)} keep showing up in your glass, which tells us what your palate gravitates toward even when you're exploring.` : ""} There's a world of wine out there that's going to light you up.`;
      case "The Deep Diver":
        return `You go deep. ${estateNames.length > 0 ? `Producers like ${joinList(estateNames, 2)} matter to you. ` : ""}${regions ? `You know ${regions} intimately. ` : ""}This kind of focus means you taste subtleties that more scattered drinkers miss — the difference between good and great.`;
      default:
        return `You know what you like${countryNames.length > 0 ? ` — ${joinList(countryNames, 2)} ${countryNames.length === 1 ? "is" : "are"} on your radar` : ""}${varietalNames.length > 0 ? ` and ${joinList(varietalNames, 2)} ${varietalNames.length === 1 ? "is" : "are"} already favorites` : ""}. As you try more wines through Sommeasy, your profile will grow richer and your recommendations will get sharper.`;
    }
  }

  if (breadth >= 5 && depth >= 5) {
    return { archetype: "The Grand Palate", archetypeEmoji: "👑", narrative: generateNarrative("The Grand Palate") };
  }
  if (breadth >= 3 && depth >= 3) {
    return { archetype: "The Connoisseur", archetypeEmoji: "🔬", narrative: generateNarrative("The Connoisseur") };
  }
  if (breadth >= 3) {
    return { archetype: "The Explorer", archetypeEmoji: "🧭", narrative: generateNarrative("The Explorer") };
  }
  if (depth >= 3) {
    return { archetype: "The Deep Diver", archetypeEmoji: "🌊", narrative: generateNarrative("The Deep Diver") };
  }
  return { archetype: "The Rising Palate", archetypeEmoji: "🌱", narrative: generateNarrative("The Rising Palate") };
}
```

- [ ] **Step 2: Verify app builds**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/lib/profileEngine.js
git commit -m "feat: simplify archetype engine to 5 broad buckets"
```

---

### Task 3.3: Update WINE_RECS IDs

**Files:**
- Modify: `src/lib/profileEngine.js`

The `WINE_RECS` object (lines 7-74) uses region IDs from `wineData.js`. These need to be updated to match the IDs generated by `make_id()` in the build script. The editorial content (wine names, `why` descriptions) is preserved exactly as-is.

- [ ] **Step 1: Review the current WINE_RECS region IDs against wineUnified.json**

Run a comparison to find which IDs need updating:

```bash
# Current region IDs used in WINE_RECS combos:
# bordeaux, burgundy, napa, sonoma, willamette, barossa, rhone, rioja,
# tuscany, piedmont, stellenbosch, constantia, mendoza, marlborough,
# mosel, swartland, priorat, douro, champagne, alsace, loire, beaujolais

# Check these against wineUnified.json:
python -c "
import json
with open('src/lib/wineUnified.json') as f:
    data = json.load(f)
all_region_ids = set()
for regions in data['regions'].values():
    for r in regions:
        all_region_ids.add(r['id'])

old_ids = ['bordeaux', 'burgundy', 'napa', 'sonoma', 'willamette', 'barossa',
           'rhone', 'rioja', 'tuscany', 'piedmont', 'stellenbosch', 'constantia',
           'mendoza', 'marlborough', 'mosel', 'swartland', 'priorat', 'douro',
           'champagne', 'alsace', 'loire', 'beaujolais']
for oid in old_ids:
    status = 'OK' if oid in all_region_ids else 'MISSING'
    print(f'  {oid:20s} {status}')
    if status == 'MISSING':
        # Find closest match
        candidates = [r for r in all_region_ids if oid in r or r in oid]
        if candidates:
            print(f'    → possible: {candidates}')
"
```

- [ ] **Step 2: Update WINE_RECS IDs based on the comparison**

For each region ID that doesn't match, update it to the correct ID from `wineUnified.json`. The wine names and descriptions remain EXACTLY as they are.

Common expected ID changes (verify against actual build output):
- `"napa"` → may become `"napa_valley"` (depends on how `make_id("Napa Valley")` resolves)
- `"rhone"` → may become `"rhone_valley"` (depends on province name in WineMag)
- `"barossa"` → may become `"barossa_valley"`
- `"willamette"` → may become `"willamette_valley"`

Also update `byCountry` keys if any country IDs changed (likely `"usa"` vs `"us"` — check the build output).

- [ ] **Step 3: Verify app builds**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/lib/profileEngine.js
git commit -m "feat: update WINE_RECS IDs to match wineUnified.json format

Preserves all editorial content — only IDs changed to align with
the unified data architecture."
```

---

### Task 3.4: Rewrite matchEngine.js — Remove Mapping Dictionaries

**Files:**
- Modify: `src/lib/matchEngine.js`

This is the core simplification. The three mapping dictionaries (`COUNTRY_TO_DNA`, `PROVINCE_TO_DNA_REGION`, `SUBREGION_TO_DNA_REGION`) exist only to translate WineMag names into `wineData.js` IDs. With unified data, IDs are shared, so mapping is either direct or via the `regionLookup` / `producerLookup` in the unified JSON.

- [ ] **Step 1: Replace imports**

```javascript
// OLD (lines 1-6):
import lookupData from "./wineReference-lookup.json";
import { COUNTRIES as DNA_COUNTRIES, REGIONS as DNA_REGIONS, VARIETALS as DNA_VARIETALS, ESTATES as DNA_ESTATES } from "./wineData";

// NEW:
import wineUnified from "./wineUnified.json";
```

- [ ] **Step 2: Delete the three mapping dictionaries and replace with unified lookups**

Delete `COUNTRY_TO_DNA` (lines 12-17), `PROVINCE_TO_DNA_REGION` (lines 19-43), `SUBREGION_TO_DNA_REGION` (lines 45-81).

Replace with:

```javascript
// Country name → country ID (built from unified data)
const COUNTRY_NAME_TO_ID = {};
for (const c of wineUnified.countries) {
  COUNTRY_NAME_TO_ID[c.name] = c.id;
}

// The unified regionLookup and producerLookup replace the old mapping tables
const { regionLookup, producerLookup, varietalLookup } = wineUnified;
```

- [ ] **Step 3: Update `VARIETY_TO_DNA` to use unified varietal data**

```javascript
// Replace the old varietyNameMap (lines 84-114) with unified data
const VARIETY_TO_DNA = {};
// Build from wineUnified.varietals
for (const v of wineUnified.varietals) {
  VARIETY_TO_DNA[v.name] = v.id;
  // Handle display names with synonyms ("Syrah / Shiraz")
  if (v.name.includes(' / ')) {
    for (const part of v.name.split(' / ')) {
      VARIETY_TO_DNA[part.trim()] = v.id;
    }
  }
}
// Add synonym lookup entries
for (const [synonym, canonicalId] of Object.entries(wineUnified.varietalLookup)) {
  // varietalLookup maps synonym_id → canonical_id, but we also need
  // display name → id mapping. Use the synonym as-is for now.
  VARIETY_TO_DNA[synonym] = canonicalId;
}
```

- [ ] **Step 4: Update `buildSearchIndex()` to use unified data**

The search index currently reads from `lookupData` (wineReference-lookup.json). It needs to read from `wineUnified` instead:

```javascript
function buildSearchIndex() {
  const idx = { regionTerms: [], producerTerms: [], varietyTerms: [], countryTerms: [] };

  // Regions — from unified regionLookup
  for (const [regionKey, data] of Object.entries(wineUnified.regionLookup)) {
    if (regionKey.length < 4 || ["other", "america", "europe"].includes(regionKey)) continue;
    idx.regionTerms.push({
      term: regionKey,
      regionId: data.regionId,
      countryId: data.country,
    });
  }
  // Also add region names themselves
  for (const [countryId, regionList] of Object.entries(wineUnified.regions)) {
    for (const r of regionList) {
      idx.regionTerms.push({
        term: r.name.toLowerCase(),
        regionId: r.id,
        countryId: countryId,
      });
    }
  }

  // Producers — from unified producerLookup
  for (const [producerKey, data] of Object.entries(wineUnified.producerLookup)) {
    idx.producerTerms.push({
      term: producerKey,
      producerId: data.producerId,
      regionId: data.regionId,
      countryId: data.country,
    });
  }
  // Also add producer names from the producers arrays
  for (const [regionId, prodList] of Object.entries(wineUnified.producers)) {
    for (const p of prodList) {
      idx.producerTerms.push({
        term: p.name.toLowerCase(),
        producerId: p.id,
        regionId: regionId,
        countryId: null, // will be resolved from region
      });
    }
  }

  // Varieties — from unified varietals
  for (const v of wineUnified.varietals) {
    idx.varietyTerms.push({
      term: v.name.toLowerCase(),
      varietalId: v.id,
      color: v.color,
    });
    // Add synonym variants
    if (v.name.includes(' / ')) {
      for (const part of v.name.split(' / ')) {
        idx.varietyTerms.push({
          term: part.trim().toLowerCase(),
          varietalId: v.id,
          color: v.color,
        });
      }
    }
  }

  // Countries
  for (const c of wineUnified.countries) {
    idx.countryTerms.push({
      term: c.name.toLowerCase(),
      countryId: c.id,
    });
  }
  // Add US state aliases
  const STATE_ALIASES = {
    "california": "us", "oregon": "us", "washington": "us",
    "new york": "us", "virginia": "us",
  };
  for (const [state, countryId] of Object.entries(STATE_ALIASES)) {
    idx.countryTerms.push({ term: state, countryId });
  }

  // Sort all term arrays by length descending (longest first to avoid false matches)
  for (const key of Object.keys(idx)) {
    idx[key].sort((a, b) => b.term.length - a.term.length);
  }

  return idx;
}

const SEARCH_INDEX = buildSearchIndex();
```

- [ ] **Step 5: Update `scoreEntry()` to use unified IDs directly**

The `scoreEntry` function currently maps WineMag data through the three dictionaries to produce DNA IDs. With unified data, the IDs from the search index are directly usable against the user's profile.

Key changes needed in `scoreEntry`:
- Instead of `dnaCountryId`, use `countryId` directly from the search result
- Instead of `dnaRegionId`, use `regionId` directly
- Instead of `dnaVarietalId`, use `varietalId` directly
- Remove all `COUNTRY_TO_DNA[...]`, `PROVINCE_TO_DNA_REGION[...]`, `SUBREGION_TO_DNA_REGION[...]` lookups

The scoring weights and match logic remain the same — only the ID resolution changes.

- [ ] **Step 6: Update `getCountryFlag()` and `getCountryName()` helper functions**

```javascript
// OLD:
export function getCountryFlag(dnaCountryId) {
  const c = DNA_COUNTRIES.find(c => c.id === dnaCountryId);
  return c ? c.emoji : "";
}
export function getCountryName(dnaCountryId) {
  const c = DNA_COUNTRIES.find(c => c.id === dnaCountryId);
  return c ? c.name : dnaCountryId;
}

// NEW:
export function getCountryFlag(countryId) {
  const c = wineUnified.countries.find(c => c.id === countryId);
  return c ? c.emoji : "";
}
export function getCountryName(countryId) {
  const c = wineUnified.countries.find(c => c.id === countryId);
  return c ? c.name : countryId;
}
```

- [ ] **Step 7: Verify app builds**

Run: `npm run build`

- [ ] **Step 8: Commit**

```bash
git add src/lib/matchEngine.js
git commit -m "feat: matchEngine reads from wineUnified.json, removes mapping dictionaries

Eliminates COUNTRY_TO_DNA, PROVINCE_TO_DNA_REGION, and SUBREGION_TO_DNA_REGION.
All IDs now come directly from the unified data source."
```

---

## Chunk 4: Cleanup and Verification

### Task 4.1: Delete Old Data Files

**Files:**
- Delete: `src/lib/wineData.js`
- Delete: `src/lib/wineReference-lookup.json`
- Delete: `scripts/build_wine_reference.py`

- [ ] **Step 1: Verify no remaining imports of old files**

```bash
# Search for any remaining references
grep -r "wineData" src/ --include="*.js" --include="*.jsx" -l
grep -r "wineReference" src/ --include="*.js" --include="*.jsx" --include="*.json" -l
grep -r "build_wine_reference" . --include="*.py" --include="*.sh" --include="*.json" -l
```

Expected: No results (all references should have been updated in previous tasks). If any remain, update them before proceeding.

- [ ] **Step 2: Delete old files**

```bash
git rm src/lib/wineData.js
git rm src/lib/wineReference-lookup.json
git rm scripts/build_wine_reference.py
```

- [ ] **Step 3: Check for wineReference.json (full version) mentioned in spec**

```bash
ls src/lib/wineReference.json 2>/dev/null && git rm src/lib/wineReference.json || echo "Not present"
```

- [ ] **Step 4: Verify app still builds**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: delete wineData.js, wineReference-lookup.json, and build_wine_reference.py

These are replaced by the unified data architecture:
- wineData.js (1,236 lines hand-curated) → wineUnified.json (generated)
- wineReference-lookup.json (252 KB) → merged into wineUnified.json
- build_wine_reference.py → replaced by build_quiz_data.py"
```

---

### Task 4.2: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the tech stack and key technical context sections**

Add/update these sections in CLAUDE.md:

Under **Key Technical Context**, update the bullet about wineReference-lookup.json:
```markdown
- wineUnified.json (generated by `scripts/build_quiz_data.py` from WineMag 130k CSV): single unified data source for quiz, profile, and matching. Contains countries, regions, producers, varietals, and lookup tables. Regenerate with: `python scripts/build_quiz_data.py data/external/winemag-data-130k-v2.csv src/lib/wineUnified.json`
- matchEngine.js uses wineUnified.json directly — no mapping dictionaries needed
- profileEngine.js uses simplified 5-archetype system with hand-curated WINE_RECS (editorial content preserved)
```

Remove the old bullet:
```markdown
- matchEngine.js uses wineReference-lookup.json (processed from 130k WineMag reviews): 1,097 regions, 2,000 producers, 488 varietals, 43 countries
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for unified data architecture"
```

---

### Task 4.3: End-to-End Verification

This is a manual testing task. The implementer should verify the full user flow works correctly.

- [ ] **Step 1: Build the app**

Run: `npm run build`
Expected: No errors

- [ ] **Step 2: Start the dev server and test the quiz flow**

Run: `npm run dev`

Test these scenarios:
1. Quiz loads and displays countries grouped by Old World / New World
2. Selecting France shows French regions (Bordeaux, Burgundy, etc.) with "Show more"
3. Selecting USA shows American regions by appellation (Napa Valley, not California)
4. Selecting a region shows its producers with "Show more" pagination
5. Varietal step shows relevant varietals based on selected regions
6. Completing the quiz generates a profile with archetype and recommendations
7. The WINE_RECS editorial descriptions display correctly

- [ ] **Step 3: Test the recommendation engine**

If you have a saved profile, test the restaurant recommendation flow:
1. Navigate to /recommend
2. Paste or upload a wine list
3. Verify wines are scored and matched against the unified profile

- [ ] **Step 4: Check bundle size**

```bash
# After building, check the size of the generated chunks
ls -la .next/static/chunks/ | sort -k5 -n | tail -20
```

The wineUnified.json should appear as part of a JS chunk. Check that it's reasonable (< 200KB gzipped).

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end testing"
```

---

### Task 4.4: Database Migration (When Ready)

**IMPORTANT:** This task should only be done when deploying to production. It truncates all existing profile data.

- [ ] **Step 1: Run the migration SQL against Supabase**

```sql
-- Clear all existing profile data (pre-launch, no user impact)
TRUNCATE wine_profiles;
TRUNCATE dna_accumulation;
TRUNCATE dna_timeline;
TRUNCATE wine_interactions;
```

**Note:** Verify which tables actually exist in Supabase before running. The spec lists these 4 tables, but some may not exist yet or may have different names. Check via:

```bash
# Use supabase CLI or dashboard to verify table names
```

- [ ] **Step 2: Verify the app works end-to-end with the clean database**

Create a new profile through the quiz and verify it saves correctly to Supabase.

---

## Summary of Commit Sequence

1. `feat: add build script skeleton with make_id() and constants`
2. `feat: add CSV loading and country aggregation`
3. `feat: add region aggregation with country-specific field logic`
4. `feat: add producer aggregation with primary region assignment`
5. `feat: add varietal aggregation with synonym normalization`
6. `feat: complete build pipeline with JSON output and summary stats`
7. `feat: generate wineUnified.json from WineMag 130k dataset`
8. **CHECKPOINT: User reviews build output**
9. `feat: quiz country step reads from wineUnified.json with Old/New World grouping`
10. `feat: quiz region step with progressive disclosure (show more)`
11. `feat: quiz producer step with pagination (show more)`
12. `feat: quiz varietal step with dynamic reranking and color grouping`
13. `feat: complete quiz component migration to wineUnified.json`
14. `feat: profileEngine reads from wineUnified.json`
15. `feat: simplify archetype engine to 5 broad buckets`
16. `feat: update WINE_RECS IDs to match wineUnified.json format`
17. `feat: matchEngine reads from wineUnified.json, removes mapping dictionaries`
18. `chore: delete wineData.js, wineReference-lookup.json, and build_wine_reference.py`
19. `docs: update CLAUDE.md for unified data architecture`
20. End-to-end verification and any fixes
