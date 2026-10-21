"""会話カードの文例データ（frontend/src/data/conversationPhrases.ts）を生成する。

入力（どちらも翻訳・文例の納品物。リポジトリには含めていない）:
  --phrases       文例表の Markdown。ID・方向・カテゴリ・優先順（上から）の正本
                  （既定: .team/inbox/CDX/b10-b3/phrases.md）
  --translations  16 言語の訳。{lang: {"conversation.C01": "..."}} 形式
                  （既定: .team/inbox/CDX/i18n/translations.json）

使い方（リポジトリ直下で）:
  python scripts/generate_conversation_phrases.py
  python scripts/generate_conversation_phrases.py --check   # 生成物が最新かだけを確かめる

検査（1 件でも外れたら生成せずに終了コード 1）:
  - 文例表の ID が重複していない・方向とカテゴリが既知の値
  - 16 言語すべてに全 ID の訳がある（空文字・空白だけも欠落扱い）
  - 文例表の ja / en / easy_ja と translations.json の値が一致する
    （どちらかだけ直したまま生成すると、表と画面がずれるため）
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PHRASES = REPO_ROOT / ".team" / "inbox" / "CDX" / "b10-b3" / "phrases.md"
DEFAULT_TRANSLATIONS = REPO_ROOT / ".team" / "inbox" / "CDX" / "i18n" / "translations.json"
OUTPUT = REPO_ROOT / "frontend" / "src" / "data" / "conversationPhrases.ts"

# frontend/src/i18n/translations.ts の LANGUAGES と同じ並び
LANGUAGES = [
    "ja", "en", "zh", "zh-TW", "ko", "vi", "th", "id",
    "ms", "tl", "ne", "fr", "de", "it", "es", "easy_ja",
]

KEY_PREFIX = "conversation."

DIRECTIONS = {
    "訪日客→スタッフ": "visitor-to-staff",
    "スタッフ→訪日客": "staff-to-visitor",
}

# 文例表のカテゴリ表記 → コード上の ID。並び = 命に関わる順（表の番号順）
CATEGORIES = {
    "01 緊急": "emergency",
    "02 けが・体調": "injury",
    "03 持病・薬": "medication",
    "04 アレルギー": "allergy",
    "05 はぐれた家族": "family",
    "06 移動支援": "mobility",
    "07 公式情報・施設": "facility",
    "08 伝達・返答": "communication",
    "09 水・生活": "daily",
    "10 通信・充電": "phone",
}

ROW_RE = re.compile(r"^\|\s*(C\d{2})\s*\|")
SEPARATOR_RE = re.compile(r"^\|[\s|:\-]+\|$")
HEADER_FIRST_CELL = "ID"


def parse_phrase_table(text: str) -> list[dict]:
    """`|` で始まる行はすべて検査する。見出し・区切り以外で文例の形をしていない行はエラー
    （黙って読み飛ばすと、壊れた行の文がデータから消えても気付けない）。"""
    rows = []
    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line.startswith("|"):
            continue
        if SEPARATOR_RE.match(line):
            continue
        first_cell = line.strip("|").split("|")[0].strip()
        if first_cell == HEADER_FIRST_CELL:
            continue
        if not ROW_RE.match(line):
            raise ValueError(f"{lineno} 行目: 文例の行として読めない（ID は C + 2 桁）: {line}")
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 6:
            raise ValueError(f"列が足りない行: {line}")
        pid, direction, category, ja, en, easy_ja = cells[:6]
        if direction not in DIRECTIONS:
            raise ValueError(f"{pid}: 未知の方向 {direction!r}")
        if category not in CATEGORIES:
            raise ValueError(f"{pid}: 未知のカテゴリ {category!r}")
        rows.append({
            "id": pid,
            "direction": DIRECTIONS[direction],
            "category": CATEGORIES[category],
            "source": {"ja": ja, "en": en, "easy_ja": easy_ja},
        })
    return rows


def find_warnings(rows: list[dict], translations: dict) -> list[str]:
    """生成は止めないが、取りこぼしの疑いがあるもの（表に無い文の訳・未知の言語）。"""
    warnings: list[str] = []
    known_ids = {r["id"] for r in rows}
    for lang in sorted(set(translations) - set(LANGUAGES)):
        warnings.append(f"未知の言語キー {lang!r}（生成に使わない）")
    extra: set[str] = set()
    for lang, table in translations.items():
        if not isinstance(table, dict):
            continue
        for key in table:
            if key.startswith(KEY_PREFIX) and key[len(KEY_PREFIX):] not in known_ids:
                extra.add(key)
    for key in sorted(extra):
        warnings.append(f"文例表に無い {key} の訳がある（生成に使わない）")
    return warnings


def build(phrases_md: str, translations: dict) -> tuple[list[dict], list[str]]:
    errors: list[str] = []
    rows = parse_phrase_table(phrases_md)
    if not rows:
        errors.append("文例表に行が無い")
    ids = [r["id"] for r in rows]
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        errors.append(f"ID が重複: {dup}")

    missing_langs = [lang for lang in LANGUAGES if lang not in translations]
    if missing_langs:
        errors.append(f"言語が無い: {missing_langs}")

    out = []
    for priority, row in enumerate(rows, start=1):
        text = {}
        for lang in LANGUAGES:
            value = translations.get(lang, {}).get(KEY_PREFIX + row["id"])
            if not isinstance(value, str) or not value.strip():
                errors.append(f"{row['id']}: {lang} の訳が無い")
                continue
            text[lang] = value.strip()
        for lang, src in row["source"].items():
            if lang in text and text[lang] != src:
                errors.append(
                    f"{row['id']}: {lang} が文例表と translations.json で食い違う"
                )
        out.append({
            "id": row["id"],
            "direction": row["direction"],
            "category": row["category"],
            "priority": priority,
            "text": text,
        })
    return out, errors


def render(phrases: list[dict]) -> str:
    def js(value) -> str:
        return json.dumps(value, ensure_ascii=False)

    lines = [
        "// このファイルは自動生成。手で直さない。",
        "// 生成: python scripts/generate_conversation_phrases.py",
        "// 入力: 文例表 phrases.md（ID・方向・カテゴリ・優先順）＋ translations.json（16 言語の訳）",
        "// 訳は翻訳草案（母語話者・医療専門家による確認は未実施）。",
        "",
        "import type { SupportedLanguage } from '@/i18n/types';",
        "",
        "/** 誰が誰に見せる文か */",
        "export type ConversationDirection = 'visitor-to-staff' | 'staff-to-visitor';",
        "",
        "/** カテゴリ ID。並びは命に関わる順 */",
        "export const CONVERSATION_CATEGORY_ORDER = [",
    ]
    for cat in CATEGORIES.values():
        lines.append(f"  {js(cat)},")
    lines += [
        "] as const;",
        "",
        "export type ConversationCategory = (typeof CONVERSATION_CATEGORY_ORDER)[number];",
        "",
        "export interface ConversationPhrase {",
        "  id: string;",
        "  direction: ConversationDirection;",
        "  category: ConversationCategory;",
        "  /** 表示の優先順（1 が先頭） */",
        "  priority: number;",
        "  text: Record<SupportedLanguage, string>;",
        "}",
        "",
        "export const CONVERSATION_PHRASES: readonly ConversationPhrase[] = [",
    ]
    for p in phrases:
        lines.append("  {")
        lines.append(f"    id: {js(p['id'])},")
        lines.append(f"    direction: {js(p['direction'])},")
        lines.append(f"    category: {js(p['category'])},")
        lines.append(f"    priority: {p['priority']},")
        lines.append("    text: {")
        for lang in LANGUAGES:
            key = js(lang) if not re.fullmatch(r"[a-z_]+", lang) else lang
            lines.append(f"      {key}: {js(p['text'][lang])},")
        lines.append("    },")
        lines.append("  },")
    lines.append("];")
    lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--phrases", type=Path, default=DEFAULT_PHRASES)
    parser.add_argument("--translations", type=Path, default=DEFAULT_TRANSLATIONS)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--check", action="store_true", help="書き込まずに生成物が最新かを確かめる")
    args = parser.parse_args(argv)

    phrases_md = args.phrases.read_text(encoding="utf-8")
    translations = json.loads(args.translations.read_text(encoding="utf-8"))
    try:
        phrases, errors = build(phrases_md, translations)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    for w in find_warnings(parse_phrase_table(phrases_md), translations):
        print(f"WARN: {w}", file=sys.stderr)
    if errors:
        for e in errors:
            print(f"ERROR: {e}", file=sys.stderr)
        return 1

    content = render(phrases)
    if args.check:
        current = args.output.read_text(encoding="utf-8") if args.output.exists() else ""
        if current != content:
            print(f"OUT OF DATE: {args.output}", file=sys.stderr)
            return 1
        print(f"up to date: {len(phrases)} phrases x {len(LANGUAGES)} languages")
        return 0

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print(f"wrote {args.output}: {len(phrases)} phrases x {len(LANGUAGES)} languages")
    return 0


if __name__ == "__main__":
    sys.exit(main())
