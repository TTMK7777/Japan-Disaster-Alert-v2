"""scripts/build_snapshot.py（同じ生成関数で JSON を書き出す CLI）。

終了コード: 0 = 全 dataset が ok / 2 = 書き出したが stale・error を含む / 1 = 書き出せなかった
"""
import importlib.util
import json
from pathlib import Path

import httpx
import pytest

from app.services.snapshot_service import DATASET_NAMES

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "build_snapshot.py"


def _load():
    spec = importlib.util.spec_from_file_location("build_snapshot", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def cli():
    return _load()


def _fetchers(fail: set[str] = frozenset(), items=None):
    def make(name):
        async def fetch():
            if name in fail:
                raise httpx.ConnectError("down")
            return list(items or [])
        return fetch
    return {name: make(name) for name in DATASET_NAMES}


@pytest.mark.asyncio
async def test_全成功なら0で書き出す(cli, tmp_path):
    out = tmp_path / "snapshot.json"
    code = await cli.run(out, fetchers=_fetchers())
    assert code == 0
    data = json.loads(out.read_text(encoding="utf-8"))
    assert all(data["datasets"][n]["status"] == "ok" for n in DATASET_NAMES)


@pytest.mark.asyncio
async def test_劣化があれば2で書き出しは行う(cli, tmp_path):
    out = tmp_path / "snapshot.json"
    code = await cli.run(out, fetchers=_fetchers(fail={"tsunami"}))
    assert code == 2
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["datasets"]["tsunami"]["status"] == "error"
    assert data["datasets"]["tsunami"]["items"] is None


@pytest.mark.asyncio
async def test_既存の出力を前回値として使いstaleにする(cli, tmp_path):
    out = tmp_path / "snapshot.json"
    assert await cli.run(out, fetchers=_fetchers()) == 0
    code = await cli.run(out, fetchers=_fetchers(fail={"tsunami"}))
    assert code == 2
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["datasets"]["tsunami"]["status"] == "stale"
    assert data["datasets"]["tsunami"]["items"] == []


@pytest.mark.asyncio
async def test_既存の出力が壊れていても上書きして進む(cli, tmp_path):
    out = tmp_path / "snapshot.json"
    out.write_text("{not json", encoding="utf-8")
    assert await cli.run(out, fetchers=_fetchers()) == 0
    json.loads(out.read_text(encoding="utf-8"))


@pytest.mark.asyncio
async def test_書き出せなければ1(cli, tmp_path):
    out = tmp_path / "no-such-dir" / "snapshot.json"
    assert await cli.run(out, fetchers=_fetchers()) == 1


@pytest.mark.asyncio
async def test_書き出しは一時ファイル経由で途中の版を残さない(cli, tmp_path):
    out = tmp_path / "snapshot.json"
    await cli.run(out, fetchers=_fetchers())
    assert [p.name for p in tmp_path.iterdir()] == ["snapshot.json"]


def test_スキーマを書き出せる(cli, tmp_path):
    from app.snapshot_models import Snapshot
    out = tmp_path / "schema.json"
    assert cli.main(["--write-schema", str(out)]) == 0
    assert json.loads(out.read_text(encoding="utf-8")) == Snapshot.model_json_schema()


def test_引数なしは使い方の誤り(cli):
    with pytest.raises(SystemExit) as exc:
        cli.main([])
    assert exc.value.code != 0


@pytest.mark.asyncio
async def test_置き換え前に権限を644にしてfsyncする(cli, tmp_path, monkeypatch):
    calls = []
    real_chmod, real_fsync, real_replace = cli.os.chmod, cli.os.fsync, cli.os.replace
    monkeypatch.setattr(cli.os, "chmod", lambda path, mode: (calls.append(("chmod", mode)), real_chmod(path, mode)))
    monkeypatch.setattr(cli.os, "fsync", lambda fd: (calls.append(("fsync", None)), real_fsync(fd)))
    monkeypatch.setattr(cli.os, "replace", lambda a, b: (calls.append(("replace", None)), real_replace(a, b)))
    out = tmp_path / "snapshot.json"
    assert await cli.run(out, fetchers=_fetchers()) == 0
    names = [c[0] for c in calls]
    assert names.index("fsync") < names.index("replace")
    assert names.index("chmod") < names.index("replace")
    assert ("chmod", 0o644) in calls
