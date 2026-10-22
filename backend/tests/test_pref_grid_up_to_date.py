"""フロントの県推定の格子表（frontend/public/data/pref-grid.json）が避難所データと一致しているか。

表は scripts/generate_pref_grid.py が backend/data/shelters/shelters.json.gz から作る生成物。
避難所データを更新して表を作り直し忘れると、フロントの「現在地から選ぶ」が古い表で県を決める。
CI は backend pytest を回すので、ここで `--check` と同じ検査をする。
"""
import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "generate_pref_grid.py"


def _load():
    spec = importlib.util.spec_from_file_location("generate_pref_grid", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_格子表は避難所データから作り直したものと一致する():
    gen = _load()
    assert gen.is_up_to_date(), "python scripts/generate_pref_grid.py で作り直す"


def test_表の引き方_県境の実在の避難所が正しい県になる():
    gen = _load()
    points, _ = gen.load_points()
    grid = gen.build_grid(points)
    # 愛知・豊橋（旧方式では静岡）/ 宮城・気仙沼（旧方式では岩手）/ 国外は None
    assert gen.lookup(grid, 34.74998, 137.396422) == 23
    assert gen.lookup(grid, 38.873143, 141.60553) == 4
    assert gen.lookup(grid, 37.566, 126.978) is None


def test_全件の正解率は98パーセント以上():
    gen = _load()
    points, _ = gen.load_points()
    grid = gen.build_grid(points)
    assert gen.accuracy(grid, points) >= 0.98
