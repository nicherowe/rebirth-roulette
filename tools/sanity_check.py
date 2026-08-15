#!/usr/bin/env python3
"""grids/ と places/ の生成結果を検証するレポートを出力する（手動実行、ビルドには含めない）。"""
import json
import re

from common import CELL_CAP, GPW_NO_DATA, ROOT

src = (ROOT / "src" / "data.js").read_text(encoding="utf-8")
rows = re.findall(r'c:\s*"([A-Z]{2})".*?p:\s*(\d+)', src)
un_pop = {c: int(p) * 1000 for c, p in rows}   # 千人 -> 人

grid_stats = json.loads((ROOT / "tools" / "grid_stats.json").read_text(encoding="utf-8"))
places_stats = json.loads((ROOT / "tools" / "places_stats.json").read_text(encoding="utf-8"))

print(f"=== grids: {len(grid_stats)} countries, cap={CELL_CAP} ===")
capped = [c for c, s in grid_stats.items() if not s["no_data"] and s["rows"] >= CELL_CAP]
print(f"cap に到達した国 ({len(capped)}): {sorted(capped)}")

no_data = [c for c, s in grid_stats.items() if s["no_data"]]
print(f"グリッドなし(フォールバック対象) ({len(no_data)}): {sorted(no_data)}  expected={sorted(GPW_NO_DATA)}")
assert set(no_data) == GPW_NO_DATA, "GPW_NO_DATA と実際の欠損国が一致しない"

print("\n=== 人口の妥当性チェック (GPWv4 2015 保持人口 vs UN WPP 2024) ===")
outliers = []
for c, s in grid_stats.items():
    if s["no_data"]:
        continue
    un = un_pop.get(c, 0)
    kept = s["kept_pop"]
    if un == 0:
        continue
    ratio = kept / un
    if not (0.5 <= ratio <= 2.0):
        outliers.append((c, kept, un, ratio))
if outliers:
    print(f"範囲外(0.5x~2.0x)の国 ({len(outliers)}):")
    for c, kept, un, ratio in outliers:
        print(f"  {c}: kept={kept:,.0f} un2024={un:,} ratio={ratio:.2f}")
else:
    print("全て 0.5x〜2.0x の範囲内")

print("\n=== ファイルサイズ ===")
sizes = sorted(((s["bytes"] for s in grid_stats.values() if not s["no_data"])), reverse=True)
print(f"grids/ 最大: {sizes[0]/1024:.1f}KB, 中央値: {sizes[len(sizes)//2]/1024:.1f}KB, 合計: {sum(sizes)/1024/1024:.1f}MB")
psizes = sorted((s["bytes"] for s in places_stats.values()), reverse=True)
print(f"places/ 最大: {psizes[0]/1024:.1f}KB, 中央値: {psizes[len(psizes)//2]/1024:.1f}KB, 合計: {sum(psizes)/1024/1024:.1f}MB")

print("\n=== places: 全200カ国で非空か ===")
empty = [c for c, s in places_stats.items() if s["rows"] == 0]
print(f"空の国: {empty if empty else 'なし'}")
assert not empty, "placesが空の国がある"

print("\nOK: sanity check passed")
