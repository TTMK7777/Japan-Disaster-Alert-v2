#!/usr/bin/env python3
"""都道府県の公式防災ページ（＋全国の旅行者向けリンク）が生きているかを実測する。

対象は frontend/src/lib/prefectureDisasterLinks.ts に書かれた URL すべて。
警報タブと「このアプリが扱う範囲」の帯から 1 タップで飛ぶ先なので、
災害のさなかに死にリンクを踏ませないよう、リンクを足したり直したりしたら**必ずこれを通す**。

判定は「リダイレクトを追った最終応答が 200 か」。200 以外（3xx で止まる・403・404・5xx・
接続失敗）はすべて一覧に出す。リダイレクトされたものは OK でも行き先を併記する。

CI には入れていない（scripts/verify_transit_links.py と同じ理由: 外部サイトの都合で
落ちる CI はやがて無視されるようになる）。

    python scripts/verify_prefecture_links.py > out.txt 2>&1

出力は UTF-8 でファイルに落とすこと（Windows の端末は cp932 で落ちる）。
"""
from __future__ import annotations

import asyncio
import re
import ssl
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
LINKS_FILE = REPO_ROOT / "frontend" / "src" / "lib" / "prefectureDisasterLinks.ts"

# 実ブラウザ以外を弾くサイトがあるため UA を付ける（verify_transit_links.py と同じ）。
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    )
}
TIMEOUT = 20.0


def browser_like_ssl_context() -> ssl.SSLContext:
    """証明書検証はそのまま、RFC 5746 非対応の古いサーバーにも接続できる TLS 設定。

    茨城県の防災ポータル（www.bousai.ibaraki.jp）は安全な再ネゴシエーション拡張に
    対応しておらず、OpenSSL 3 既定の Python は UNSAFE_LEGACY_RENEGOTIATION_DISABLED で
    接続を拒否する。実 Chrome では 200 で開ける（2026-10-22 実測）ため、
    ここで落とすと「利用者には開けるリンク」を死にリンクと誤判定する。
    """
    context = ssl.create_default_context()
    context.options |= getattr(ssl, "OP_LEGACY_SERVER_CONNECT", 0x4)
    return context
# 自治体サイトに一斉に投げない（同時接続の上限）
CONCURRENCY = 8

# `pref: '13', // 東京都` / `disasterUrl: '...'` / `foreignUrl: '...'` の各行を拾う。
PREF_RE = re.compile(r"^\s*pref:\s*'(\d{2})',\s*//\s*(\S+)", re.M)
URL_RE = re.compile(r"^\s*(disasterUrl|foreignUrl):\s*'(https?://[^']+)'", re.M)
NATIONAL_RE = re.compile(r"NATIONAL_TRAVELER_URL\s*=\s*'(https?://[^']+)'")


def collect_targets(source: str) -> list[tuple[str, str]]:
    """(ラベル, URL) の一覧。同じ URL が disaster と foreign で重なれば 1 回だけ叩く。"""
    targets: list[tuple[str, str]] = []
    national = NATIONAL_RE.search(source)
    if national is None:
        raise SystemExit(f"NATIONAL_TRAVELER_URL が見つからない: {LINKS_FILE}")
    targets.append(("00 全国 (JNTO)", national.group(1)))

    current = ""
    seen: set[str] = {national.group(1)}
    for line in source.splitlines():
        pref = PREF_RE.match(line)
        if pref:
            current = f"{pref.group(1)} {pref.group(2)}"
            continue
        url = URL_RE.match(line)
        if url and url.group(2) not in seen:
            seen.add(url.group(2))
            kind = "disaster" if url.group(1) == "disasterUrl" else "foreign"
            targets.append((f"{current} {kind}", url.group(2)))
    return targets


async def check(
    client: httpx.AsyncClient, sem: asyncio.Semaphore, label: str, url: str
) -> tuple[bool, str]:
    async with sem:
        try:
            # HEAD を拒むサイトがあるので GET する（本文は読み捨てる）
            response = await client.get(url, timeout=TIMEOUT, follow_redirects=True)
        except httpx.HTTPError as e:
            return False, f"{label:<24} ★NG  ERROR {type(e).__name__}: {url}"

    ok = response.status_code == 200
    note = f" -> {response.url}" if str(response.url) != url else ""
    mark = "OK  " if ok else "★NG "
    return ok, f"{label:<24} {mark} {response.status_code} {url}{note}"


async def main() -> int:
    targets = collect_targets(LINKS_FILE.read_text(encoding="utf-8"))
    sem = asyncio.Semaphore(CONCURRENCY)
    async with httpx.AsyncClient(headers=HEADERS, verify=browser_like_ssl_context()) as client:
        results = await asyncio.gather(
            *(check(client, sem, label, url) for label, url in targets)
        )

    failures = [line for ok, line in results if not ok]
    for _, line in results:
        print(line)

    print(f"\n{len(targets) - len(failures)}/{len(targets)} が 200")
    if failures:
        print("★ 200 以外:")
        for line in failures:
            print(line)
        print("→ foreignUrl なら null にして disasterUrl に落とす。disasterUrl も死んでいれば県ごと外して全国リンクに落とす")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
