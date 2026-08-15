"""Stage 2 用オフラインデータ生成の共通処理。"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA = ROOT / "data"

# GPWv4 CSV は iso_a2 が空欄の行があり、iso_a3 でしか引けない国がある
GPW_A3_FALLBACK = {"TV": "TUV"}

# GPWv4 に使えるグリッド行が存在しない国（RS/ME は "SCG" という統合コードでしか
# 存在せず、国境を推測して分割するとバグの元になるため採用しない）。
# クライアント側もこのセットを NO_GRID として持ち、fetch自体を試みない。
GPW_NO_DATA = {"EH", "SS", "XK", "RS", "ME"}

POP_THRESHOLD = 20      # これ未満の人口のセルは無視（ほぼ無人）
CELL_CAP = 40000        # 国あたりの最大セル数


def country_codes():
    """src/data.js から我々の200カ国のISO2コード一覧を読む（国リストの二重管理を避ける）"""
    src = (ROOT / "src" / "data.js").read_text(encoding="utf-8")
    return re.findall(r'c:\s*"([A-Z]{2})"', src)


def write_json_compact(path: Path, obj) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    s = json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
    path.write_text(s, encoding="utf-8")
    return len(s.encode("utf-8"))
