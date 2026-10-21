#!/usr/bin/env python3
"""表示用スナップショットを JSON ファイルに書き出す（GET /api/v1/snapshot と同じ生成関数）。

後で Cloud Scheduler → Cloud Run Job → GCS に載せ替えるための CLI。手順は
docs/ops/deployment.md「表示用スナップショット」を参照。

    cd backend
    ./.venv/Scripts/python.exe ../scripts/build_snapshot.py --out ../snapshot.json
    ./.venv/Scripts/python.exe ../scripts/build_snapshot.py --write-schema ../docs/dev/snapshot-schema.json

--out に既存のスナップショットがあれば前回値として読み込む（今回取れなかった dataset を
stale として前回の値で出す。読めなければ無視して上書きする）。
書き出しは一時ファイル → 置き換えで、途中の版を残さない。

終了コード:
    0  全 dataset が ok で書き出した
    2  書き出したが stale / error の dataset がある（Job の再試行・監視の対象）
    1  書き出せなかった
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from pydantic import ValidationError  # noqa: E402

from app.services.snapshot_service import (  # noqa: E402
    DATASET_NAMES,
    SnapshotBuilder,
    build_default_fetchers,
    serialize_snapshot,
)
from app.snapshot_models import DatasetStatus, Snapshot  # noqa: E402

EXIT_OK = 0
EXIT_WRITE_FAILED = 1
EXIT_DEGRADED = 2


def _load_previous(path: Path) -> Snapshot | None:
    try:
        return Snapshot.model_validate_json(path.read_bytes())
    except FileNotFoundError:
        return None
    except (OSError, ValueError, ValidationError) as e:
        print(f"前回のスナップショットを読めないので無視する: {type(e).__name__}", file=sys.stderr)
        return None


def _write_atomic(path: Path, data: bytes) -> None:
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


async def _default_fetchers():
    from app.services.p2p_service import P2PQuakeService
    from app.services.tsunami_service import TsunamiService
    from app.services.volcano_service import VolcanoService

    services = (P2PQuakeService(), TsunamiService(), VolcanoService())
    return build_default_fetchers(*services), services


async def run(out: Path, *, fetchers=None) -> int:
    services = ()
    if fetchers is None:
        fetchers, services = await _default_fetchers()
    try:
        builder = SnapshotBuilder(fetchers)
        previous = _load_previous(out)
        if previous is not None:
            builder.seed(previous)
        snapshot = await builder.build()
    finally:
        for service in services:
            await service.close()

    body, _ = serialize_snapshot(snapshot)
    try:
        _write_atomic(out, body)
    except OSError as e:
        print(f"書き出しに失敗: {out} ({type(e).__name__})", file=sys.stderr)
        return EXIT_WRITE_FAILED

    statuses = {name: getattr(snapshot.datasets, name).status for name in DATASET_NAMES}
    summary = ", ".join(
        f"{name}={status.value}({len(getattr(snapshot.datasets, name).items or [])})"
        if status != DatasetStatus.error else f"{name}=error"
        for name, status in statuses.items()
    )
    print(f"{out}: {summary}")
    return EXIT_OK if all(s == DatasetStatus.ok for s in statuses.values()) else EXIT_DEGRADED


def write_schema(out: Path) -> int:
    text = json.dumps(Snapshot.model_json_schema(), ensure_ascii=False, indent=2) + "\n"
    try:
        _write_atomic(out, text.encode("utf-8"))
    except OSError as e:
        print(f"書き出しに失敗: {out} ({type(e).__name__})", file=sys.stderr)
        return EXIT_WRITE_FAILED
    print(f"{out}: JSON Schema を書き出した")
    return EXIT_OK


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--out", type=Path, help="スナップショットの書き出し先")
    group.add_argument("--write-schema", type=Path, help="JSON Schema の書き出し先")
    args = parser.parse_args(argv)
    if args.write_schema is not None:
        return write_schema(args.write_schema)
    return asyncio.run(run(args.out))


if __name__ == "__main__":
    sys.exit(main())
