#!/usr/bin/env python3
"""gpwv4-2015.csv (0.1度セル) から国ごとの grids/<ISO2>.json を生成する。

出力形式: [[lon10, lat10, pop], ...]
  lon10/lat10 = 0.1度セルの南西角の座標を10倍して丸めた整数（0.1度グリッドなので整数になる）
  pop         = 人口を丸めた整数
セルは population 降順。population<20 のセルは除去し、上位 CELL_CAP 件までに制限する。
GPW_NO_DATA の国はファイルを生成しない（クライアント側で fetch 自体をスキップする）。
"""
import csv
import json
from collections import defaultdict

from common import (CELL_CAP, DATA, GPW_A3_FALLBACK, GPW_NO_DATA,
                     POP_THRESHOLD, ROOT, country_codes, write_json_compact)

codes = country_codes()
target_by_a2 = {c for c in codes if c not in GPW_NO_DATA and c not in GPW_A3_FALLBACK}
target_by_a3 = {v: k for k, v in GPW_A3_FALLBACK.items()}  # {'TUV': 'TV'}

buckets = defaultdict(list)   # our_iso2 -> [(lon, lat, pop), ...]

csv_path = DATA / "gpwv4-2015.csv"
with open(csv_path, newline="", encoding="utf-8") as f:
    r = csv.DictReader(f)
    for row in r:
        if row["size"] != "0.1":
            continue
        a2, a3 = row["iso_a2"], row["iso_a3"]
        iso2 = None
        if a2 in target_by_a2:
            iso2 = a2
        elif a3 in target_by_a3:
            iso2 = target_by_a3[a3]
        if iso2 is None:
            continue
        buckets[iso2].append((float(row["lon"]), float(row["lat"]), float(row["population"])))

stats = {}
grids_dir = ROOT / "grids"
for iso2 in codes:
    if iso2 in GPW_NO_DATA:
        stats[iso2] = {"rows": 0, "kept_pop": 0, "source_pop": 0, "no_data": True}
        continue
    rows = buckets.get(iso2, [])
    source_pop = sum(p for _, _, p in rows)
    kept = sorted((p for p in rows if p[2] >= POP_THRESHOLD), key=lambda x: -x[2])[:CELL_CAP]
    kept_pop = sum(p for _, _, p in kept)
    cells = [[round(lon * 10), round(lat * 10), round(pop)] for lon, lat, pop in kept]
    size_bytes = write_json_compact(grids_dir / f"{iso2}.json", cells)
    stats[iso2] = {
        "rows": len(cells),
        "total_rows": len(rows),
        "kept_pop": kept_pop,
        "source_pop": source_pop,
        "bytes": size_bytes,
        "no_data": False,
    }

(ROOT / "tools" / "grid_stats.json").write_text(
    json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8"
)
print(f"done: {len(codes) - len(GPW_NO_DATA)} grid files written, "
      f"{len(GPW_NO_DATA)} countries skipped (no data): {sorted(GPW_NO_DATA)}")
