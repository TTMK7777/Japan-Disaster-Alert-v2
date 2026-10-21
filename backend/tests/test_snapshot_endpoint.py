"""GET /api/v1/snapshot と SnapshotCache（60 秒のメモリキャッシュ・多重生成の防止）。"""
import asyncio
import json
from datetime import datetime, timezone

import pytest

from app import main as main_module
from app.services import snapshot_service
from app.services.snapshot_service import (
    DATASET_NAMES,
    SNAPSHOT_MAX_AGE_SECONDS,
    SnapshotBuilder,
    SnapshotCache,
)


class _CountingBuilder:
    """build の呼び出し回数を数え、生成に時間がかかる状況を作る。"""

    def __init__(self, delay: float = 0.0):
        self.calls = 0
        self.delay = delay
        self._inner = SnapshotBuilder(
            {name: self._empty for name in DATASET_NAMES},
            clock=lambda: datetime(2026, 10, 22, tzinfo=timezone.utc),
        )

    @staticmethod
    async def _empty():
        return []

    async def build(self):
        self.calls += 1
        if self.delay:
            await asyncio.sleep(self.delay)
        return await self._inner.build()


class _Monotonic:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


class TestCache:
    def test_キャッシュ時間は60秒(self):
        assert SNAPSHOT_MAX_AGE_SECONDS == 60

    @pytest.mark.asyncio
    async def test_同時10リクエストでも生成は1回(self):
        builder = _CountingBuilder(delay=0.05)
        cache = SnapshotCache(builder, monotonic=_Monotonic())
        results = await asyncio.gather(*(cache.get() for _ in range(10)))
        assert builder.calls == 1
        assert len({r.etag for r in results}) == 1

    @pytest.mark.asyncio
    async def test_60秒未満は作り直さない_60秒で作り直す(self):
        clock = _Monotonic()
        builder = _CountingBuilder()
        cache = SnapshotCache(builder, monotonic=clock)
        await cache.get()
        clock.now += SNAPSHOT_MAX_AGE_SECONDS - 0.001
        await cache.get()
        assert builder.calls == 1, "60 秒未満なのに作り直した"
        clock.now += 0.001
        await cache.get()
        assert builder.calls == 2, "60 秒経っても作り直していない"

    @pytest.mark.asyncio
    async def test_期限切れ後の同時リクエストも生成は1回(self):
        clock = _Monotonic()
        builder = _CountingBuilder(delay=0.05)
        cache = SnapshotCache(builder, monotonic=clock)
        await cache.get()
        clock.now += SNAPSHOT_MAX_AGE_SECONDS
        await asyncio.gather(*(cache.get() for _ in range(10)))
        assert builder.calls == 2

    @pytest.mark.asyncio
    async def test_生成が例外でも次のリクエストで再試行できる(self):
        class _Boom:
            calls = 0

            async def build(self):
                self.calls += 1
                raise RuntimeError("unexpected")

        builder = _Boom()
        cache = SnapshotCache(builder, monotonic=_Monotonic())
        with pytest.raises(RuntimeError):
            await cache.get()
        with pytest.raises(RuntimeError):
            await cache.get()
        assert builder.calls == 2, "ロックが解放されていない"


@pytest.fixture
def fresh_cache(monkeypatch):
    builder = _CountingBuilder()
    cache = SnapshotCache(builder, monotonic=_Monotonic())
    monkeypatch.setattr(main_module, "snapshot_cache", cache)
    monkeypatch.setattr(main_module.limiter, "enabled", False)
    return builder


class TestEndpoint:
    @pytest.mark.asyncio
    async def test_スナップショットを返す(self, client, fresh_cache):
        res = await client.get("/api/v1/snapshot")
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("application/json")
        data = res.json()
        assert data["schema_version"] == "1.0"
        assert set(data["datasets"]) == {"earthquakes", "tsunami", "volcano_warnings"}

    @pytest.mark.asyncio
    async def test_キャッシュ用ヘッダ(self, client, fresh_cache):
        res = await client.get("/api/v1/snapshot")
        assert res.headers["cache-control"] == "public, max-age=60, stale-while-revalidate=30"
        assert res.headers["etag"].startswith('"') and res.headers["etag"].endswith('"')

    @pytest.mark.asyncio
    async def test_max_ageは生成からの経過秒を引く(self, client, monkeypatch):
        """最悪の古さを約 2 分（60 + 30 + 生成間隔のずれ）に抑える。"""
        clock = _Monotonic()
        monkeypatch.setattr(main_module, "snapshot_cache", SnapshotCache(_CountingBuilder(), monotonic=clock))
        monkeypatch.setattr(main_module.limiter, "enabled", False)
        await client.get("/api/v1/snapshot")
        clock.now += 20.4
        res = await client.get("/api/v1/snapshot")
        assert res.headers["cache-control"] == "public, max-age=39, stale-while-revalidate=30"
        clock.now += 39.5  # 経過 59.9 秒
        res = await client.get("/api/v1/snapshot")
        assert res.headers["cache-control"] == "public, max-age=0, stale-while-revalidate=30"

    @pytest.mark.asyncio
    async def test_304でもmax_ageは経過秒を引く(self, client, monkeypatch):
        clock = _Monotonic()
        monkeypatch.setattr(main_module, "snapshot_cache", SnapshotCache(_CountingBuilder(), monotonic=clock))
        monkeypatch.setattr(main_module.limiter, "enabled", False)
        first = await client.get("/api/v1/snapshot")
        clock.now += 30
        res = await client.get("/api/v1/snapshot", headers={"If-None-Match": first.headers["etag"]})
        assert res.status_code == 304
        assert res.headers["cache-control"] == "public, max-age=30, stale-while-revalidate=30"

    @pytest.mark.asyncio
    async def test_ETagが一致すれば304で本文なし(self, client, fresh_cache):
        first = await client.get("/api/v1/snapshot")
        etag = first.headers["etag"]
        second = await client.get("/api/v1/snapshot", headers={"If-None-Match": etag})
        assert second.status_code == 304
        assert second.content == b""
        assert second.headers["etag"] == etag
        assert second.headers["cache-control"] == "public, max-age=60, stale-while-revalidate=30"

    @pytest.mark.asyncio
    async def test_ETagが違えば200(self, client, fresh_cache):
        res = await client.get("/api/v1/snapshot", headers={"If-None-Match": '"other"'})
        assert res.status_code == 200
        assert json.loads(res.content)["schema_version"] == "1.0"

    @pytest.mark.asyncio
    async def test_連続リクエストは生成1回(self, client, fresh_cache):
        for _ in range(5):
            await client.get("/api/v1/snapshot")
        assert fresh_cache.calls == 1

    @pytest.mark.asyncio
    async def test_レート制限の対象(self, client, monkeypatch):
        """既存方針どおり rate_limit_general で制限される（exempt にしていない）。"""
        monkeypatch.setattr(main_module, "snapshot_cache",
                            SnapshotCache(_CountingBuilder(), monotonic=_Monotonic()))
        # 制限値はデコレート時に評価される（既定 60/minute）ので、61 回目以降で 429 になる
        main_module.limiter.reset()
        try:
            codes = []
            for _ in range(70):
                codes.append((await client.get("/api/v1/snapshot")).status_code)
            assert 429 in codes, sorted(set(codes))
        finally:
            main_module.limiter.reset()

    def test_本番の既定キャッシュは本物のサービスにつながっている(self):
        """テスト用に差し替えていない状態で、3 つの fetcher が揃っていること。"""
        cache = main_module.snapshot_cache
        assert isinstance(cache, SnapshotCache)
        assert set(cache.builder.fetcher_names) == set(DATASET_NAMES)
        assert cache.max_age_seconds == snapshot_service.SNAPSHOT_MAX_AGE_SECONDS
