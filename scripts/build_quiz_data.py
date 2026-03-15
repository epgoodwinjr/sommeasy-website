#!/usr/bin/env python3
"""
build_quiz_data.py — Processes WineMag 130k CSV into wineUnified.json

Usage:
    python scripts/build_quiz_data.py data/external/winemag-data-130k-v2.csv src/lib/wineUnified.json
"""

import sys
import os
import json
import unicodedata
import re
from collections import defaultdict
from datetime import datetime, timezone

import pandas as pd

# ═══════════════════════════════════════════════════════
# THRESHOLDS — tune these to control what makes it into the quiz
# ═══════════════════════════════════════════════════════

MIN_COUNTRY_REVIEWS = 100
MIN_REGION_REVIEWS = 20
MIN_PRODUCER_REVIEWS = 3
MIN_VARIETAL_REVIEWS = 100
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
    "France": "\U0001f1eb\U0001f1f7", "Italy": "\U0001f1ee\U0001f1f9",
    "Spain": "\U0001f1ea\U0001f1f8", "US": "\U0001f1fa\U0001f1f8",
    "Argentina": "\U0001f1e6\U0001f1f7", "Chile": "\U0001f1e8\U0001f1f1",
    "Australia": "\U0001f1e6\U0001f1fa", "South Africa": "\U0001f1ff\U0001f1e6",
    "Portugal": "\U0001f1f5\U0001f1f9", "Germany": "\U0001f1e9\U0001f1ea",
    "Austria": "\U0001f1e6\U0001f1f9", "New Zealand": "\U0001f1f3\U0001f1ff",
    "Greece": "\U0001f1ec\U0001f1f7", "Hungary": "\U0001f1ed\U0001f1fa",
    "Croatia": "\U0001f1ed\U0001f1f7", "Slovenia": "\U0001f1f8\U0001f1ee",
    "Georgia": "\U0001f1ec\U0001f1ea", "Romania": "\U0001f1f7\U0001f1f4",
    "Bulgaria": "\U0001f1e7\U0001f1ec", "Lebanon": "\U0001f1f1\U0001f1e7",
    "Israel": "\U0001f1ee\U0001f1f1", "Turkey": "\U0001f1f9\U0001f1f7",
    "Brazil": "\U0001f1e7\U0001f1f7", "Uruguay": "\U0001f1fa\U0001f1fe",
    "Canada": "\U0001f1e8\U0001f1e6", "Mexico": "\U0001f1f2\U0001f1fd",
    "China": "\U0001f1e8\U0001f1f3", "India": "\U0001f1ee\U0001f1f3",
    "Japan": "\U0001f1ef\U0001f1f5", "Switzerland": "\U0001f1e8\U0001f1ed",
    "Luxembourg": "\U0001f1f1\U0001f1fa", "Czech Republic": "\U0001f1e8\U0001f1ff",
    "Slovakia": "\U0001f1f8\U0001f1f0", "Moldova": "\U0001f1f2\U0001f1e9",
    "Cyprus": "\U0001f1e8\U0001f1fe", "England": "\U0001f3f4\U000e0067\U000e0062\U000e0065\U000e006e\U000e0067\U000e007f",
}

# Which WineMag field to use as the primary region for each country.
# Countries not listed here default to "province".
REGION_FIELD_OVERRIDE = {
    "US": "region_1",
    "Australia": "region_1",
    "Italy": "region_1",       # Province lumps Friuli+Alto Adige as "Northeastern Italy"
    "Spain": "region_1",       # Province is too broad (Northern Spain, Catalonia)
    "Argentina": "region_1",   # Province is just "Mendoza Province"
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
    "Rosé": "rosé", "Rosato": "rosé", "Rosado": "rosé",
    "Portuguese Red": "red", "Portuguese White": "white",
    "Glera": "white", "Prosecco": "white",
    "Port": "red", "Sherry": "white",
    "Corvina": "red", "Montepulciano": "red", "Zweigelt": "red",
    "Mencía": "red", "Verdicchio": "white", "Vernaccia": "white",
    "Alvarinho": "white", "Grillo": "white", "Muscat": "white",
    "Friulano": "white", "Nerello Mascalese": "red", "Viura": "white",
    "Bonarda": "red", "Sagrantino": "red", "St. Laurent": "red",
    "Ribolla Gialla": "white", "Arneis": "white", "Lagrein": "red",
    "Negroamaro": "red", "Cortese": "white", "Verdelho": "white",
    "Agiorgitiko": "red", "Petit Manseng": "white", "Pecorino": "white",
    "Sylvaner": "white", "Furmint": "white", "Turbiana": "white",
    "Meritage": "red", "Lambrusco": "red", "Alicante Bouschet": "red",
    "Vidal Blanc": "white", "Moscatel": "white",
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


# ═══════════════════════════════════════════════════════
# CSV LOADING
# ═══════════════════════════════════════════════════════

def load_csv(csv_path):
    """Load WineMag CSV, return DataFrame with relevant columns."""
    # The WineMag CSV may have a non-header first row — detect and skip it
    with open(csv_path, 'r') as f:
        first_line = f.readline().strip()
    skip = 1 if 'country' not in first_line else 0

    df = pd.read_csv(csv_path, skiprows=skip, usecols=[
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


# ═══════════════════════════════════════════════════════
# COUNTRY AGGREGATION
# ═══════════════════════════════════════════════════════

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
            'emoji': COUNTRY_EMOJI.get(name, ''),
            'world': world,
            'reviewCount': int(row['reviewCount']),
            'avgRating': round(float(row['avgRating']), 1),
        })

    # Sort by reviewCount descending
    countries.sort(key=lambda c: c['reviewCount'], reverse=True)
    return countries


# ═══════════════════════════════════════════════════════
# REGION AGGREGATION
# ═══════════════════════════════════════════════════════

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

            # Skip catch-all "Other" regions — not useful as quiz options
            if region_name.lower().strip() == 'other' or region_name.endswith(' Other'):
                continue

            region_id = make_id(region_name)
            avg_rating = round(float(group['points'].mean()), 1)
            producer_count = group['winery'].nunique()

            # Top 5 varietals by review count (excluding blends)
            non_blend = group[~group['variety'].str.contains(r'Blend|-', na=False, regex=True)]
            normalized_varieties = non_blend['variety'].map(
                lambda v: VARIETAL_SYNONYMS.get(v, v)
            )
            top_vars = normalized_varieties.value_counts().head(5)
            top_varietal_ids = [make_id(v) for v in top_vars.index]

            # Determine province value
            if get_region_field(country_name) == 'province':
                province = region_name
            else:
                mode = group['province'].mode()
                province = mode.iloc[0] if len(mode) > 0 else ''

            region_list.append({
                'id': region_id,
                'name': region_name,
                'province': province,
                'reviewCount': int(len(group)),
                'avgRating': avg_rating,
                'producerCount': producer_count,
                'topVarietals': top_varietal_ids,
            })

            # Build sub-appellation lookup from region_1 and region_2 values
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


# ═══════════════════════════════════════════════════════
# PRODUCER AGGREGATION
# ═══════════════════════════════════════════════════════

def _top_varietals(group, n=5):
    """Get top N varietals by review count from a group, excluding blends."""
    non_blend = group[~group['variety'].str.contains(r'Blend|-', na=False, regex=True)]
    normalized = non_blend['variety'].map(lambda v: VARIETAL_SYNONYMS.get(v, v))
    top = normalized.value_counts().head(n)
    return [make_id(v) for v in top.index]


def aggregate_producers(df, qualifying_regions, min_reviews=MIN_PRODUCER_REVIEWS, max_per_region=MAX_PRODUCERS_PER_REGION):
    """Aggregate producers, assign each to primary region (most reviews).

    Args:
        df: Full DataFrame
        qualifying_regions: dict of { region_id: country_id }
        min_reviews: minimum reviews for a producer to qualify
        max_per_region: cap producers per region

    Returns:
        (producers_dict, producer_lookup)
    """
    df = df.copy()
    df['_primary_region'] = df.apply(_get_primary_region, axis=1)
    df['_region_id'] = df['_primary_region'].apply(lambda r: make_id(r) if r else None)

    # Filter to only rows whose region is qualifying
    df = df[df['_region_id'].isin(qualifying_regions)]

    # Group by winery to find primary region assignment
    winery_groups = df.groupby('winery')

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


# ═══════════════════════════════════════════════════════
# VARIETAL AGGREGATION
# ═══════════════════════════════════════════════════════

def aggregate_varietals(df, min_reviews=MIN_VARIETAL_REVIEWS):
    """Aggregate varietals globally, normalizing synonyms and excluding blends."""
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
        synonym_lower = synonym.lower().strip()
        if synonym_lower not in varietal_lookup:
            varietal_lookup[synonym_lower] = canonical_id

    return varietals, varietal_lookup


# ═══════════════════════════════════════════════════════
# MAIN BUILD PIPELINE
# ═══════════════════════════════════════════════════════

def build_unified_json(csv_path, min_country_reviews=MIN_COUNTRY_REVIEWS,
                       min_region_reviews=MIN_REGION_REVIEWS,
                       min_producer_reviews=MIN_PRODUCER_REVIEWS,
                       min_varietal_reviews=MIN_VARIETAL_REVIEWS,
                       max_producers_per_region=MAX_PRODUCERS_PER_REGION):
    """Build the complete unified JSON from a WineMag CSV."""
    df = load_csv(csv_path)
    source_rows = len(df)

    # 1. Countries
    countries = aggregate_countries(df, min_reviews=min_country_reviews)
    qualifying_country_ids = [c['id'] for c in countries]

    # 2. Regions
    regions, region_lookup = aggregate_regions(df, qualifying_country_ids, min_reviews=min_region_reviews)

    # Update country entries with regionCount and topVarietals
    for country in countries:
        cid = country['id']
        country_regions = regions.get(cid, [])
        country['regionCount'] = len(country_regions)
        seen = []
        for r in country_regions[:5]:
            for v in r.get('topVarietals', []):
                if v not in seen:
                    seen.append(v)
        country['topVarietals'] = seen[:5]

    # 3. Producers
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

    print(f"\n=== Countries ===")
    for c in result['countries']:
        region_count = len(result['regions'].get(c['id'], []))
        producer_count = sum(
            len(result['producers'].get(r['id'], []))
            for r in result['regions'].get(c['id'], [])
        )
        print(f"  {c['emoji']} {c['name']:20s} reviews={c['reviewCount']:5d}  regions={region_count:3d}  producers={producer_count:4d}")

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {output_path} ({os.path.getsize(output_path):,} bytes)")


if __name__ == '__main__':
    main()
