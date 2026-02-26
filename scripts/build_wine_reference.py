#!/usr/bin/env python3
"""
Process the WineMag 130k dataset into a compact JSON reference for Sommeasy.

Extracts:
- All countries with wine count
- All provinces/regions/sub-regions with parent mappings
- All grape varieties with aliases and color classification
- Top producers (by review count and rating)
- Notable wines (highly rated, frequently reviewed)

Output: src/lib/wineReference.json (compact, ~200KB, client-safe)
"""

import pandas as pd
import json
import sys
import os
import re

def classify_grape_color(variety):
    """Classify a grape variety as red, white, rosé, or sparkling."""
    reds = {
        'cabernet sauvignon', 'merlot', 'pinot noir', 'syrah', 'shiraz', 'malbec',
        'tempranillo', 'sangiovese', 'nebbiolo', 'grenache', 'garnacha', 'zinfandel',
        'pinotage', 'mourvèdre', 'monastrell', 'cabernet franc', 'petit verdot',
        'barbera', 'dolcetto', 'primitivo', 'nero d\'avola', 'aglianico',
        'carmenère', 'carmenere', 'tannat', 'touriga nacional', 'tinta roriz',
        'gamay', 'corvina', 'montepulciano', 'nerello mascalese', 'lagrein',
        'blaufränkisch', 'zweigelt', 'st. laurent', 'petite sirah', 'carignan',
        'cinsault', 'counoise', 'graciano', 'mencía', 'bonarda', 'sagrantino',
        'schioppettino', 'refosco', 'xinomavro', 'kadarka', 'dornfelder',
        'norton', 'castelão', 'baga', 'touriga franca', 'tinta de toro',
        'frappato', 'cannonau', 'negroamaro', 'susumaniello', 'gaglioppo',
        'teroldego', 'cesanese', 'encruzado', 'alfrocheiro',
    }
    whites = {
        'chardonnay', 'sauvignon blanc', 'riesling', 'pinot grigio', 'pinot gris',
        'chenin blanc', 'viognier', 'grüner veltliner', 'gruner veltliner',
        'albariño', 'albarino', 'gewürztraminer', 'gewurztraminer', 'sémillon',
        'semillon', 'muscadet', 'vermentino', 'torrontés', 'torrontes',
        'verdejo', 'godello', 'txakoli', 'melon', 'marsanne', 'roussanne',
        'clairette', 'picpoul', 'verdicchio', 'garganega', 'fiano',
        'falanghina', 'greco', 'trebbiano', 'friulano', 'ribolla gialla',
        'arneis', 'cortese', 'grillo', 'carricante', 'catarratto',
        'müller-thurgau', 'silvaner', 'scheurebe', 'kerner',
        'welschriesling', 'furmint', 'hárslevelű', 'juhfark',
        'assyrtiko', 'moschofilero', 'malagousia', 'vidiano',
        'malvasia', 'pecorino', 'passerina', 'nosiola', 'timorasso',
        'nascetta', 'loureiro', 'avesso', 'arinto', 'antão vaz', 'encruzado',
        'white blend', 'pinot blanc', 'muscat', 'moscato',
    }
    v = variety.lower().strip()
    if v in reds or any(r in v for r in ['red blend', 'bordeaux-style red', 'meritage', 'rhône-style red']):
        return 'red'
    if v in whites or any(w in v for w in ['white blend', 'bordeaux-style white', 'rhône-style white']):
        return 'white'
    if 'rosé' in v or 'rose' in v:
        return 'rosé'
    if 'sparkling' in v or 'champagne' in v or 'prosecco' in v or 'cava' in v:
        return 'sparkling'
    return 'unknown'

def normalize_region(region):
    """Normalize region name for consistent matching."""
    if not region or pd.isna(region):
        return None
    return region.strip()

def build_reference(csv_path, output_path):
    print(f"Reading {csv_path}...")
    df = pd.read_csv(csv_path, index_col=0)
    print(f"  {len(df)} records loaded")

    # Clean
    df['country'] = df['country'].fillna('').str.strip()
    df['province'] = df['province'].fillna('').str.strip()
    df['region_1'] = df['region_1'].fillna('').str.strip()
    df['region_2'] = df['region_2'].fillna('').str.strip()
    df['variety'] = df['variety'].fillna('').str.strip()
    df['winery'] = df['winery'].fillna('').str.strip()
    df['title'] = df['title'].fillna('').str.strip()
    df['points'] = pd.to_numeric(df['points'], errors='coerce')
    df['price'] = pd.to_numeric(df['price'], errors='coerce')

    ref = {}

    # ─── Countries ───
    print("Processing countries...")
    country_counts = df[df['country'] != ''].groupby('country').agg(
        count=('country', 'size'),
        avg_points=('points', 'mean'),
        avg_price=('price', 'mean'),
    ).sort_values('count', ascending=False)

    ref['countries'] = {}
    for country, row in country_counts.iterrows():
        ref['countries'][country] = {
            'count': int(row['count']),
            'avgPoints': round(row['avg_points'], 1) if not pd.isna(row['avg_points']) else None,
            'avgPrice': round(row['avg_price'], 0) if not pd.isna(row['avg_price']) else None,
        }

    # ─── Regions (province + region_1 + region_2) ───
    print("Processing regions...")
    ref['regions'] = {}

    for _, row in df.iterrows():
        country = row['country']
        if not country:
            continue

        province = row['province']
        r1 = row['region_1']
        r2 = row['region_2']

        if country not in ref['regions']:
            ref['regions'][country] = {}

        if province:
            if province not in ref['regions'][country]:
                ref['regions'][country][province] = {'count': 0, 'subregions': {}}
            ref['regions'][country][province]['count'] += 1

            if r1:
                if r1 not in ref['regions'][country][province]['subregions']:
                    ref['regions'][country][province]['subregions'][r1] = {'count': 0}
                ref['regions'][country][province]['subregions'][r1]['count'] += 1

    # Flatten to a lookup: region_name → {country, province, count}
    region_lookup = {}
    for country, provinces in ref['regions'].items():
        for province, pdata in provinces.items():
            key = province.lower()
            if key not in region_lookup or pdata['count'] > region_lookup[key]['count']:
                region_lookup[key] = {'country': country, 'province': province, 'count': pdata['count']}
            for subregion, sdata in pdata.get('subregions', {}).items():
                skey = subregion.lower()
                if skey not in region_lookup or sdata['count'] > region_lookup[skey]['count']:
                    region_lookup[skey] = {'country': country, 'province': province, 'subregion': subregion, 'count': sdata['count']}

    # ─── Varieties ───
    print("Processing varieties...")
    variety_counts = df[df['variety'] != ''].groupby('variety').agg(
        count=('variety', 'size'),
        avg_points=('points', 'mean'),
    ).sort_values('count', ascending=False)

    ref['varieties'] = {}
    for variety, row in variety_counts.iterrows():
        if row['count'] < 3:
            continue
        ref['varieties'][variety] = {
            'count': int(row['count']),
            'color': classify_grape_color(variety),
            'avgPoints': round(row['avg_points'], 1) if not pd.isna(row['avg_points']) else None,
        }

    # ─── Top Producers (wineries with 5+ reviews) ───
    print("Processing producers...")
    producer_stats = df[df['winery'] != ''].groupby('winery').agg(
        count=('winery', 'size'),
        avg_points=('points', 'mean'),
        avg_price=('price', 'mean'),
        country=('country', 'first'),
        province=('province', 'first'),
    )
    top_producers = producer_stats[producer_stats['count'] >= 5].sort_values('avg_points', ascending=False)

    ref['producers'] = {}
    for winery, row in top_producers.head(2000).iterrows():
        ref['producers'][winery] = {
            'count': int(row['count']),
            'avgPoints': round(row['avg_points'], 1) if not pd.isna(row['avg_points']) else None,
            'country': row['country'],
            'province': row['province'],
        }

    # ─── Notable Wines (90+ points, for identification) ───
    print("Processing notable wines...")
    notable = df[df['points'] >= 90].copy()
    notable['name_clean'] = notable['title'].apply(lambda t: re.sub(r'\s*\d{4}\s*$', '', t).strip())

    wine_stats = notable.groupby('name_clean').agg(
        count=('name_clean', 'size'),
        max_points=('points', 'max'),
        avg_price=('price', 'mean'),
        variety=('variety', 'first'),
        country=('country', 'first'),
        province=('province', 'first'),
        winery=('winery', 'first'),
        description=('description', 'first'),
    ).sort_values('max_points', ascending=False)

    ref['notableWines'] = []
    for name, row in wine_stats.head(3000).iterrows():
        ref['notableWines'].append({
            'name': name,
            'winery': row['winery'],
            'points': int(row['max_points']),
            'price': round(row['avg_price'], 0) if not pd.isna(row['avg_price']) else None,
            'variety': row['variety'],
            'country': row['country'],
            'province': row['province'],
            'desc': (row['description'][:120] + '...') if isinstance(row['description'], str) and len(row['description']) > 120 else row['description'],
        })

    # ─── Region flat lookup (for client-side matching) ───
    ref['regionLookup'] = {}
    for key, data in sorted(region_lookup.items(), key=lambda x: -x[1]['count']):
        if data['count'] >= 5:
            ref['regionLookup'][key] = {
                'country': data['country'],
                'province': data.get('province', ''),
                'subregion': data.get('subregion', ''),
                'count': data['count'],
            }

    # ─── Write output ───
    print(f"\nReference stats:")
    print(f"  Countries: {len(ref['countries'])}")
    print(f"  Region lookup entries: {len(ref['regionLookup'])}")
    print(f"  Varieties: {len(ref['varieties'])}")
    print(f"  Top producers: {len(ref['producers'])}")
    print(f"  Notable wines: {len(ref['notableWines'])}")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(ref, f, separators=(',', ':'))

    size_kb = os.path.getsize(output_path) / 1024
    print(f"\n  Output: {output_path} ({size_kb:.0f} KB)")

    # Also write a smaller "lookup-only" version (no notable wines, no descriptions)
    lookup_only = {
        'countries': {k: v['count'] for k, v in ref['countries'].items()},
        'regionLookup': ref['regionLookup'],
        'varieties': {k: {'color': v['color'], 'count': v['count']} for k, v in ref['varieties'].items()},
        'producers': {k: {'country': v['country'], 'province': v.get('province', '')} for k, v in ref['producers'].items()},
    }
    lookup_path = output_path.replace('.json', '-lookup.json')
    with open(lookup_path, 'w') as f:
        json.dump(lookup_only, f, separators=(',', ':'))

    lookup_size = os.path.getsize(lookup_path) / 1024
    print(f"  Lookup: {lookup_path} ({lookup_size:.0f} KB)")

    return ref

if __name__ == '__main__':
    csv_path = sys.argv[1] if len(sys.argv) > 1 else 'data/external/winemag-data-130k-v2.csv'
    output_path = sys.argv[2] if len(sys.argv) > 2 else 'src/lib/wineReference.json'

    if not os.path.exists(csv_path):
        print(f"ERROR: CSV not found at {csv_path}")
        print("Please provide the path to winemag-data-130k-v2.csv")
        sys.exit(1)

    build_reference(csv_path, output_path)
    print("\nDone! Next: update matchEngine.js to use wineReference.json")
