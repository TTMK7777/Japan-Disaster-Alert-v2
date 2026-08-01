#!/usr/bin/env python3
"""実際の気象庁 API を叩いて、警報が全言語で読める形で出るかを目視確認する。

合成フィクスチャは「自分が想定した形」しか含まないので、通って当然になる。
実レスポンスに当てるまで、パース処理が正しいとは言えない。

    python scripts/verify_warnings_live.py            # 主要な予報区を巡回
    python scripts/verify_warnings_live.py 471000     # 予報区を指定

出力は UTF-8 でファイルに落とすこと（Windows の端末は cp932 で落ちる）:

    python scripts/verify_warnings_live.py > out.txt 2>&1
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.services.warning_service import WarningService  # noqa: E402
from app.utils.area_codes import AREA_CODES  # noqa: E402

# 表示確認に使う言語（日本語・英語・非ラテン文字・ラテン文字を1つずつ）
SAMPLE_LANGS = ["ja", "en", "ko", "th", "ne", "fr"]


async def check(service: WarningService, code: str, label: str) -> int:
    print(f"\n=== {label} ({code}) ===")
    alerts = await service.get_warnings(code, "ja")
    if not alerts:
        print("  警報なし")
        return 0

    print(f"  {len(alerts)} 件")
    for lang in SAMPLE_LANGS:
        localized = await service.get_warnings(code, lang)
        if not localized:
            print(f"  [{lang}] ★取得できず（言語によって件数が変わるのは異常）")
            continue
        first = localized[0]
        name = first.title_translated or first.title
        print(f"  [{lang:<7}] {name} / {first.area}")
    return len(alerts)


async def main() -> int:
    targets = (
        [(c, c) for c in sys.argv[1:]]
        if len(sys.argv) > 1
        else [(AREA_CODES[p], p) for p in ("東京都", "沖縄県", "鹿児島県", "北海道", "大阪府")]
    )

    service = WarningService()
    try:
        total = 0
        for code, label in targets:
            total += await check(service, code, label)
        print(f"\n合計 {total} 件")
        if total == 0:
            print("※ どの地域にも警報が出ていない時間帯だと 0 件になる。0 件 = 正常とは限らない")
    finally:
        await service.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
