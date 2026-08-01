#!/usr/bin/env python3
"""気象庁の公式地域マスタから `backend/app/services/area_names.py` を生成する。

## なぜ生成するのか

気象庁の警報 JSON（`/bosai/warning/data/warning/{code}.json`）には
**地域名が入っていない**。`areaTypes[].areas[]` の中身は `code` と `warnings` だけで、
`name` キーは存在しない（2026-08-01 に東京 130000・沖縄 471000 の実レスポンスで確認）。

そのため地域名はコードから引くしかなく、その対応表が公式の
`/bosai/common/const/area.json` にある。全階層に `name`（日本語）と
`enName`（英語）が入っている。

## なぜ静的モジュールに焼き込むのか

このアプリは停電・低回線・オフラインで動くことを要件にしている（docs の R2）。
起動時や実行時に area.json を取りに行くと、その要件を壊す。
そのため生成物をリポジトリにコミットし、実行時のネットワーク依存をゼロにする。

## 対象の階層

- `offices`  … 都道府県相当（例 130000=東京都、471000=沖縄本島地方）。フォールバック用
- `class10s` … 警報・注意報の細分区域（例 130010=東京地方、471010=本島中南部）。表示の主役

`class20s`（市町村、7桁）は取り込まない。警報 JSON の `areaTypes[1]` がこの粒度だが、
30 市町村を読点で連結しても読めないうえ、`areaTypes[0]` と同じ警報が入る。
表示は細分区域（class10）に寄せる。

## 使い方

    python scripts/generate_area_names.py

気象庁のマスタが更新されたときに再実行して差分をコミットする。
"""
from __future__ import annotations

import json
import subprocess
import sys
import urllib.request
from pathlib import Path

AREA_JSON_URL = "https://www.jma.go.jp/bosai/common/const/area.json"
OUTPUT = Path(__file__).resolve().parent.parent / "backend" / "app" / "services" / "area_names.py"

# 取り込む階層。警報 JSON の areaTypes[0] は class10s、都道府県指定は offices。
TARGET_LEVELS = ("offices", "class10s")


def fetch_area_master(url: str = AREA_JSON_URL) -> dict:
    with urllib.request.urlopen(url, timeout=30) as response:  # noqa: S310 (定数 URL)
        return json.loads(response.read().decode("utf-8"))


def build_table(master: dict) -> dict[str, dict[str, str]]:
    """code -> {"ja": 日本語名, "en": 英語名} を組み立てる。

    同じコードが複数階層に現れることがある（例 011000 は offices にも class10s にも
    存在する）。その場合は **後勝ち**にし、TARGET_LEVELS の並び順で class10s を優先する。
    細分区域として使われる文脈の方が表示上は正しいため。
    """
    table: dict[str, dict[str, str]] = {}
    for level in TARGET_LEVELS:
        entries = master.get(level, {})
        if not entries:
            raise SystemExit(f"area.json に階層 {level!r} が無い。マスタの構造が変わった可能性がある")
        for code, entry in entries.items():
            ja = (entry.get("name") or "").strip()
            en = (entry.get("enName") or "").strip()
            if not ja:
                continue
            table[code] = {"ja": ja, "en": en or ja}
    return table


def build_offices(master: dict) -> dict[str, dict[str, object]]:
    """府県予報区（offices）だけを取り出す。

    **警報 JSON を取得できるのはこの単位だけ**（`/warning/data/warning/{code}.json`）。
    `class10s` のコードを渡しても 404 になる。

    ここが「1 都道府県 = 1 コード」ではないことに注意する。
    北海道は 7、沖縄は 4、鹿児島は 2 の予報区に分かれている。
    """
    offices: dict[str, dict[str, object]] = {}
    for code, entry in master.get("offices", {}).items():
        offices[code] = {
            "ja": (entry.get("name") or "").strip(),
            "en": (entry.get("enName") or "").strip(),
            "parent": entry.get("parent", ""),
        }
    return offices


def render_module(table: dict[str, dict[str, str]], offices: dict[str, dict[str, object]]) -> str:
    lines = [
        '"""気象庁の地域コード → 地域名（日本語 / 英語）。',
        "",
        "**このファイルは自動生成物。手で編集しない。**",
        "生成元: https://www.jma.go.jp/bosai/common/const/area.json",
        "生成スクリプト: scripts/generate_area_names.py",
        "",
        "気象庁の警報 JSON には地域名が入っていない（`code` のみ）ため、",
        "表示名はこの表から引く。オフラインでも動く必要があるので静的に焼き込んでいる。",
        "",
        f"収録階層: {', '.join(TARGET_LEVELS)}（class20s=市町村は対象外）",
        f"収録件数: AREA_NAMES={len(table)} / FORECAST_OFFICE_CODES={len(offices)}",
        '"""',
        "",
        "#: 表示用。府県予報区（offices）と一次細分区域（class10s）の両方を含む。",
        "AREA_NAMES: dict[str, dict[str, str]] = {",
    ]
    for code in sorted(table):
        entry = table[code]
        lines.append(f'    {code!r}: {{"ja": {entry["ja"]!r}, "en": {entry["en"]!r}}},')
    lines.extend([
        "}",
        "",
        "#: 警報 JSON を取得できるコード（府県予報区）。ここに無いコードは 404 になる。",
        "#: 「1 都道府県 = 1 コード」ではない点に注意（北海道 7・沖縄 4・鹿児島 2）。",
        "FORECAST_OFFICE_CODES: frozenset[str] = frozenset({",
    ])
    for code in sorted(offices):
        lines.append(f"    {code!r},  # {offices[code]['ja']}")
    lines.append("})")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    print(f"取得中: {AREA_JSON_URL}")
    master = fetch_area_master()
    table = build_table(master)
    offices = build_offices(master)
    print(f"収録件数: AREA_NAMES={len(table)}（階層: {', '.join(TARGET_LEVELS)}） / offices={len(offices)}")

    # 生成物が壊れていないことを、書き出す前に自分で確かめる
    for code in ("130000", "130010", "471000", "471010"):
        if code not in table:
            raise SystemExit(f"想定するコード {code} がマスタに無い。構造が変わった可能性がある")
    print("サンプル: " + ", ".join(f"{c}={table[c]['ja']}/{table[c]['en']}" for c in ("130010", "471010")))

    # 「1 都道府県 = 1 予報区」ではないことを、生成のたびに目に見える形で残す
    multi = {"北海道": "01", "鹿児島": "46", "沖縄": "47"}
    for label, prefix in multi.items():
        hits = sorted(c for c in offices if c.startswith(prefix))
        print(f"  予報区（{label}）: {len(hits)} 件 {hits}")

    source = render_module(table, offices)
    OUTPUT.write_text(source, encoding="utf-8")
    print(f"書き出し: {OUTPUT}")

    # 生成した Python が実際に import できるかまで確認する
    result = subprocess.run(
        [sys.executable, "-c", f"import ast,pathlib;ast.parse(pathlib.Path({str(OUTPUT)!r}).read_text(encoding='utf-8'))"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit(f"生成物が Python として不正:\n{result.stderr}")
    print("構文チェック: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
