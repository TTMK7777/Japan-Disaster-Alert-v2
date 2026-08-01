#!/usr/bin/env python3
"""交通リンク集の URL が生きているかを実測する。

災害のさなかに死にリンクを踏ませるのは、リンクが無いより悪い。
リンクを足したり直したりしたら**必ずこれを通す**こと。

CI には入れていない。外部サイトの都合（メンテナンス・レート制限）で落ちる CI は
やがて無視されるようになり、本当に壊れたときに気付けなくなるため。

    python scripts/verify_transit_links.py

出力は UTF-8 でファイルに落とすこと（Windows の端末は cp932 で落ちる）:

    python scripts/verify_transit_links.py > out.txt 2>&1
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import httpx  # noqa: E402

from app.services.transit_links import TRANSIT_LINKS  # noqa: E402

# 実ブラウザ以外を弾くサイトがあるため UA を付ける。
# 付けないと 403 が返り「リンクが死んでいる」と誤判定する。
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    )
}
TIMEOUT = 20.0


async def check(client: httpx.AsyncClient, label: str, url: str) -> tuple[bool, str]:
    try:
        # HEAD を拒むサイトがあるので GET する（本文は読み捨てる）
        response = await client.get(url, timeout=TIMEOUT, follow_redirects=True)
    except httpx.HTTPError as e:
        return False, f"{label:<38} ERROR {type(e).__name__}: {url}"

    ok = response.status_code < 400
    redirected = str(response.url) != url
    note = f" -> {response.url}" if redirected else ""
    mark = "OK  " if ok else "★NG "
    return ok, f"{label:<38} {mark} {response.status_code} {url}{note}"


async def main() -> int:
    targets: list[tuple[str, str]] = []
    for link in TRANSIT_LINKS:
        targets.append((f"{link.id}", link.url))
        if link.url_ja != link.url:
            targets.append((f"{link.id} (ja)", link.url_ja))

    async with httpx.AsyncClient(headers=HEADERS) as client:
        results = await asyncio.gather(*(check(client, label, url) for label, url in targets))

    failures = 0
    for ok, line in results:
        print(line)
        if not ok:
            failures += 1

    print(f"\n{len(targets) - failures}/{len(targets)} OK")
    if failures:
        print("★ 死んでいるリンクがある。修正するか、リンク集から外すこと")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
