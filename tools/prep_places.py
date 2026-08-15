#!/usr/bin/env python3
"""cities5000.txt (GeoNames) から国ごとの places/<ISO2>.json を生成する。

出力形式: [[lon, lat, asciiname], ...]
地名は asciiname（ローマ字表記）のみを使用し、日本語訳は行わない。
"""
import json
from collections import defaultdict

from common import DATA, ROOT, country_codes, write_json_compact

codes = set(country_codes())
buckets = defaultdict(list)

# GeoNames のダンプ形式(タブ区切り、ヘッダ行なし):
# geonameid,name,asciiname,alternatenames,lat,lon,fclass,fcode,countrycode,cc2,
# admin1,admin2,admin3,admin4,population,elevation,dem,timezone,moddate
txt_path = DATA / "cities5000.txt"
with open(txt_path, encoding="utf-8") as f:
    for line in f:
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 9:
            continue
        cc = parts[8]
        if cc not in codes:
            continue
        asciiname = parts[2] or parts[1]
        try:
            lat, lon = float(parts[4]), float(parts[5])
        except ValueError:
            continue
        buckets[cc].append((lon, lat, asciiname))

places_dir = ROOT / "places"
stats = {}
for iso2 in codes:
    rows = buckets.get(iso2, [])
    size_bytes = write_json_compact(places_dir / f"{iso2}.json", [list(r) for r in rows])
    stats[iso2] = {"rows": len(rows), "bytes": size_bytes}

(ROOT / "tools" / "places_stats.json").write_text(
    json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8"
)
empty = [c for c, s in stats.items() if s["rows"] == 0]
print(f"done: {len(codes)} places files written. countries with 0 places: {empty}")
