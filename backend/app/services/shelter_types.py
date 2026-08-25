# -*- coding: utf-8 -*-
"""避難所の災害種別ビットマスク。

`scripts/build_shelters.py`（生成側）と `shelter_service._read_bundled`（読取側）の
**両方がこの表を使う**。以前は両ファイルに同じ辞書が手書き複製されており、
片方だけ変更すると 115,674 件の避難所の対応災害種別が**全件サイレントに誤表示**
される構造だった（ビット位置の対応がずれても例外は出ない）。

依存ゼロの独立モジュールにしているのは、生成スクリプトが `app.config`
（環境変数を読む）を引き込まずに import できるようにするため。

ビット位置は同梱データ `data/shelters/shelters.json.gz` に焼き込まれているので、
**並べ替え・挿入をしてはいけない**。追加は末尾（1 << 8 以降）のみ。
変更した場合はデータの再生成が必要になる。
"""

#: 災害種別 -> ビット位置。ShelterInfo.types の文字列表現と対応する
DISASTER_BITS: dict[str, int] = {
    "flood": 1 << 0,        # 洪水
    "landslide": 1 << 1,    # 崖崩れ、土石流及び地滑り
    "storm_surge": 1 << 2,  # 高潮
    "earthquake": 1 << 3,   # 地震
    "tsunami": 1 << 4,      # 津波
    "fire": 1 << 5,         # 大規模な火事
    "inland_flood": 1 << 6, # 内水氾濫
    "volcano": 1 << 7,      # 火山現象
}


def mask_to_types(mask: int) -> tuple[str, ...]:
    """ビットマスクを災害種別の文字列タプルへ展開する。"""
    return tuple(key for key, bit in DISASTER_BITS.items() if mask & bit)
