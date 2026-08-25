#!/usr/bin/env python3
"""国土地理院の「指定緊急避難場所」CSV を、アプリが読む正規化データへ変換する。

    python scripts/build_shelters.py <mergeFromCity_2.csv> [-o data/shelters/shelters.json.gz]

## なぜ CSV をそのまま同梱しないか

- 生 CSV は 16MB。正規化して gzip すると 2.5MB に収まり、リポジトリにも Docker イメージにも
  無理なく載る（`backend/Dockerfile` は既に `COPY data ./data` している）。
- 列名が日本語のままだと、配布側の軽微な改称でアプリが黙って 0 件になる。実際に
  `施設名` を期待するコードに対して実データの列は `施設・場所名` で、**全行スキップして
  15 件のサンプルへ無言でフォールバック**していた。変換をここに閉じ込めれば、
  壊れたときに壊れるのはこのスクリプトだけで済む。

## 出力形式

オブジェクトの配列ではなく**配列の配列**にしている。キー名が 115,674 回繰り返されるのを
避けるためで、これだけで JSON が 3 割ほど小さくなる。

    {
      "meta":     {"source": ..., "license": ..., "retrieved": ..., "count": ...},
      "fields":   ["id", "name", "address", "lat", "lon", "types"],
      "shelters": [["01100-0001", "もみじ台中学校", "札幌市...", 43.02, 141.4, 9], ...]
    }

`types` は災害種別のビットマスク（下の DISASTER_BITS）。文字列配列より小さく、
突合も速い。

## 出典・ライセンス

国土地理院「指定緊急避難場所データ」（公共データ利用規約 第1.0版 / PDL1.0）。
再配布可。ただし **出典の明示**と、加工した場合は**加工した旨を出典とは別に**記載する
ことが求められる。生成物の meta と `data/shelters/LICENSE` の両方に入れている。
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import sys
from pathlib import Path

# 読取側 (app/services/shelter_service.py) と同じ表を使う。
# 以前は両ファイルに手書き複製されており、片方だけ変えると 115,674 件の
# 対応災害種別が全件サイレントに誤表示される構造だった。
# cwd に依存せず import できるよう backend/ を sys.path に足す
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.services.shelter_types import DISASTER_BITS  # noqa: E402

# CSV の列名 -> 災害種別キー。**配布元の列名をそのまま書く**（推測しない）
DISASTER_COLUMNS: dict[str, str] = {
    "洪水": "flood",
    "崖崩れ、土石流及び地滑り": "landslide",
    "高潮": "storm_surge",
    "地震": "earthquake",
    "津波": "tsunami",
    "大規模な火事": "fire",
    "内水氾濫": "inland_flood",
    "火山現象": "volcano",
}

# 該当を表す値。配布元は "1"、G空間情報センターの加工版は "◎" を使う
TRUTHY = {"1", "○", "◎", "TRUE", "true", "True", "yes", "Yes"}

NAME_COLUMN = "施設・場所名"
ID_COLUMN = "共通ID"
ADDRESS_COLUMN = "住所"
LAT_COLUMN = "緯度"
LON_COLUMN = "経度"

SOURCE_URL = "https://hinanmap.gsi.go.jp/hinanjocp/hinanbasho/koukaidate.html"
LICENSE = "公共データ利用規約（第1.0版） / PDL1.0"
ATTRIBUTION = "出典：国土地理院ウェブサイト（https://hinanmap.gsi.go.jp/hinanjocp/hinanbasho/koukaidate.html）"
PROCESSING_NOTE = "国土地理院「指定緊急避難場所データ」を加工して作成"

# 日本の領域。これを外れる座標は取り込まない（列ズレの検知も兼ねる）
JAPAN_BBOX = (20.0, 46.5, 122.0, 154.0)  # lat_min, lat_max, lon_min, lon_max


def build(csv_path: Path) -> dict:
    rows: list[list] = []
    skipped = {"no_name": 0, "no_coords": 0, "out_of_japan": 0, "bad_number": 0}

    # 配布元は UTF-8 BOM 付き。utf-8 で開くと先頭列名に BOM が残り、列が引けなくなる
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        missing = [c for c in (NAME_COLUMN, LAT_COLUMN, LON_COLUMN) if c not in (reader.fieldnames or [])]
        if missing:
            raise SystemExit(
                f"必須の列が見つかりません: {missing}\n"
                f"  実際の列: {reader.fieldnames}\n"
                "配布元が列名を変えた可能性があります。DISASTER_COLUMNS / *_COLUMN を確認してください。"
            )

        for row in reader:
            name = (row.get(NAME_COLUMN) or "").strip()
            if not name:
                skipped["no_name"] += 1
                continue

            lat_raw = (row.get(LAT_COLUMN) or "").strip()
            lon_raw = (row.get(LON_COLUMN) or "").strip()
            if not lat_raw or not lon_raw:
                skipped["no_coords"] += 1
                continue
            try:
                lat, lon = float(lat_raw), float(lon_raw)
            except ValueError:
                skipped["bad_number"] += 1
                continue

            lat_min, lat_max, lon_min, lon_max = JAPAN_BBOX
            if not (lat_min <= lat <= lat_max and lon_min <= lon <= lon_max):
                skipped["out_of_japan"] += 1
                continue

            mask = 0
            for column, key in DISASTER_COLUMNS.items():
                if (row.get(column) or "").strip() in TRUTHY:
                    mask |= DISASTER_BITS[key]

            # 共通ID は配布元が振る安定した識別子。これを使えば更新をまたいで ID が変わらない
            # （施設名+座標のハッシュだと、改称や測地の微修正で別物になってしまう）
            shelter_id = (row.get(ID_COLUMN) or "").strip() or f"{lat:.5f},{lon:.5f}"

            rows.append([
                shelter_id,
                name,
                (row.get(ADDRESS_COLUMN) or "").strip(),
                round(lat, 6),
                round(lon, 6),
                mask,
            ])

    return {
        "meta": {
            "source": SOURCE_URL,
            "license": LICENSE,
            "attribution": ATTRIBUTION,
            "processing": PROCESSING_NOTE,
            "count": len(rows),
            "skipped": skipped,
            # 「開設中かどうか」「収容人数」「電話番号」は配布データに存在しない。
            # 無い情報を UI で断言しないための備忘として明記しておく
            "fields_not_available": ["capacity", "phone", "facilities", "is_open"],
        },
        "fields": ["id", "name", "address", "lat", "lon", "types"],
        "shelters": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", type=Path, help="mergeFromCity_2.csv のパス")
    parser.add_argument(
        "-o", "--output", type=Path,
        default=Path(__file__).resolve().parent.parent / "data" / "shelters" / "shelters.json.gz",
    )
    args = parser.parse_args()

    if not args.csv_path.exists():
        raise SystemExit(f"CSV が見つかりません: {args.csv_path}")

    payload = build(args.csv_path)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # mtime を書かない（同じ入力なら同じバイト列になり、差分が出ない）
    with gzip.GzipFile(args.output, "wb", compresslevel=9, mtime=0) as gz:
        gz.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))

    size_mb = args.output.stat().st_size / 1024 / 1024
    print(f"収録: {payload['meta']['count']:,}件")
    print(f"除外: {payload['meta']['skipped']}")
    print(f"出力: {args.output} ({size_mb:.2f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
