#!/usr/bin/env python3
"""cities5000.txt (GeoNames) から国ごとの places/<ISO2>.json を生成する。

出力形式: [[lon, lat, asciiname, admin1name, population, isCapital], ...]
地名・州/都道府県名は asciiname（ローマ字表記）のみを使用し、日本語訳は行わない。
admin1name は admin1CodesASCII.txt から引く「州・都道府県クラスの広域名」。
isCapital は GeoNames の feature code が PPLC（首都）の場合に 1。
"""
import json
from collections import defaultdict

from common import DATA, ROOT, country_codes, write_json_compact

codes = set(country_codes())

# admin1 コード(例 "JP.40") -> 広域名の英語表記(例 "Tokyo")
admin1_names = {}
with open(DATA / "admin1CodesASCII.txt", encoding="utf-8") as f:
    for line in f:
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 3:
            continue
        code, _name, ascii_name = parts[0], parts[1], parts[2]
        admin1_names[code] = ascii_name or parts[1]

buckets = defaultdict(list)

# GeoNames のダンプ形式(タブ区切り、ヘッダ行なし):
# geonameid,name,asciiname,alternatenames,lat,lon,fclass,fcode,countrycode,cc2,
# admin1,admin2,admin3,admin4,population,elevation,dem,timezone,moddate
txt_path = DATA / "cities5000.txt"
with open(txt_path, encoding="utf-8") as f:
    for line in f:
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 15:
            continue
        cc = parts[8]
        if cc not in codes:
            continue
        asciiname = parts[2] or parts[1]
        try:
            lat, lon = float(parts[4]), float(parts[5])
            population = int(parts[14] or 0)
        except ValueError:
            continue
        admin1 = admin1_names.get(f"{cc}.{parts[10]}", "")
        is_capital = 1 if parts[7] == "PPLC" else 0
        buckets[cc].append((lon, lat, asciiname, admin1, population, is_capital))

places_dir = ROOT / "places"
stats = {}
for iso2 in codes:
    rows = buckets.get(iso2, [])
    # 人口降順（クライアント側で「主要都市」を優先選択する際に使う）
    rows.sort(key=lambda r: -r[4])
    size_bytes = write_json_compact(places_dir / f"{iso2}.json", [list(r) for r in rows])
    stats[iso2] = {"rows": len(rows), "bytes": size_bytes, "capitals": sum(r[5] for r in rows)}

(ROOT / "tools" / "places_stats.json").write_text(
    json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8"
)
empty = [c for c, s in stats.items() if s["rows"] == 0]
no_capital = [c for c, s in stats.items() if s["capitals"] == 0]
print(f"done: {len(codes)} places files written. countries with 0 places: {empty}")
print(f"countries with no PPLC capital found ({len(no_capital)}): {no_capital}")
