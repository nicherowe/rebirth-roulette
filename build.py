#!/usr/bin/env python3
"""src/ の各ファイルを template.html のプレースホルダーへ差し込み、index.html を生成する。
index.html は直接手編集せず、このスクリプトの出力とすること。
"""
import pathlib

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"

tpl = (SRC / "template.html").read_text(encoding="utf-8")
replacements = {
    "{{STYLES}}": (SRC / "styles.css").read_text(encoding="utf-8"),
    "{{DATA_JS}}": (SRC / "data.js").read_text(encoding="utf-8"),
    "{{GEO_INDEX_JS}}": (SRC / "geo-index.js").read_text(encoding="utf-8"),
    "{{WORLD_JS}}": (SRC / "world-geo.js").read_text(encoding="utf-8"),
    "{{MAP_JS}}": (SRC / "map.js").read_text(encoding="utf-8"),
    "{{ALIASES_JS}}": (SRC / "aliases.js").read_text(encoding="utf-8"),
    "{{APP_JS}}": (SRC / "app.js").read_text(encoding="utf-8"),
}
for k, v in replacements.items():
    tpl = tpl.replace(k, v.rstrip("\n"))

(ROOT / "index.html").write_text(tpl, encoding="utf-8")
print(f"index.html written ({len(tpl)} chars)")
