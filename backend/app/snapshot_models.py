"""表示用スナップショット（GET /api/v1/snapshot・scripts/build_snapshot.py）のスキーマ。

設計: .team/inbox/CDX/b5-design（B5）。範囲判断: DIR-20261022-004。
JSON Schema の書き出し先は docs/dev/snapshot-schema.json（テストでモデルとの一致を固定）。

方針:
- 言語別の表示文は持たない。事実（コード・数値・気象庁の日本語名）だけを持ち、
  文言はフロントの辞書で描く
- dataset ごとに status を持つ。「取得失敗」と「0 件」を区別する
  - ok    : 今回取得に成功。items は空配列もありうる（確認済みの 0 件）
  - stale : 今回は失敗。items と fetched_at は**前回成功時**のもの（前回成功から 15 分以内に限る）
  - error : 今回失敗し、15 分以内の前回成功も無い。items は null（0 件ではない）
- 未確定・不明な値は null。0 や番兵値（-1・-200）を入れない
- 互換のない変更は schema_version の上位桁を上げる。キーの追加は下位桁
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Generic, Literal, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, Field, model_validator

SCHEMA_VERSION = "1.0"


class DatasetStatus(str, Enum):
    ok = "ok"
    stale = "stale"
    error = "error"


class SourceProvider(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Literal["jma", "p2pquake"]
    name_ja: str
    name_en: str
    url: str
    #: origin = 発表元 / distributor = 発表元の情報を中継する配信元
    role: Literal["origin", "distributor"]
    datasets: list[str]


class SnapshotSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    providers: list[SourceProvider]
    #: このスナップショットは公式発表ではない（気象庁の発表を中継したもの）
    official: Literal[False] = False
    notice_ja: str
    notice_en: str


class EarthquakeItem(BaseModel):
    """直近の地震（P2P 地震情報が中継する気象庁の地震情報）。同じ地震の複数報は 1 件にまとめる。"""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(description="P2P の発表 ID")
    occurred_at: Optional[datetime] = Field(description="発生時刻（JST のオフセット付き）。解釈できなければ null")
    location_ja: Optional[str] = Field(description="震源地名（気象庁の日本語名）。調査中は null")
    magnitude: Optional[float] = Field(description="マグニチュード。未確定は null")
    depth_km: Optional[int] = Field(description="震源の深さ km。0 は『ごく浅い』。未確定は null")
    max_intensity: Optional[str] = Field(description="最大震度（気象庁の表記: 1〜4, 5弱, 5強, 6弱, 6強, 7）。不明は null")
    max_scale: Optional[int] = Field(description="P2P の震度コード（10〜70）。不明は null")
    latitude: Optional[float]
    longitude: Optional[float]
    domestic_tsunami: str = Field(
        description="P2P の国内津波コード（None / Unknown / Checking / NonEffective / Watch / Warning）"
    )


class TsunamiArea(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(description="津波予報区コード（気象庁）。区域名は上流に無いのでコードのみ")
    kind_ja: str = Field(description="上流の種別名そのまま")
    level: Literal["major_warning", "warning", "advisory", "unknown"]


class TsunamiItem(BaseModel):
    """発表中の津波警報・注意報（イベントごとの最新報）。"""

    model_config = ConfigDict(extra="forbid")

    event_id: str
    report_id: str = Field(description="list.json の ctt（報の作成時刻）")
    report_datetime: Optional[str] = Field(description="発表時刻（上流の文字列そのまま）")
    info_type: Optional[str] = Field(description="発表 / 訂正 など（上流の ift）")
    warning_level: Literal["major_warning", "warning", "advisory", "unknown"]
    earthquake_time: Optional[str]
    epicenter_ja: Optional[str]
    epicenter_en: Optional[str]
    magnitude: Optional[str] = Field(description="上流の文字列そのまま（『M8を超える』等がありうる）")
    areas: list[TsunamiArea]


class VolcanoWarningItem(BaseModel):
    """発表中の噴火警報・予報（解除は含まない）。"""

    model_config = ConfigDict(extra="forbid")

    volcano_code: str
    volcano_name_ja: str
    volcano_name_en: Optional[str]
    alert_level: Optional[int] = Field(description="噴火警戒レベル 1〜5。レベル制でない火山は null")
    warning_name_ja: str
    condition: str = Field(description="発表 / 継続 / 切替 / 引上げ / 引下げ")
    severity: str = Field(description="advisory / high / extreme")
    issued_at: Optional[str]
    municipalities_ja: list[str]
    latitude: Optional[float] = Field(description="火山の位置。警戒範囲ではない")
    longitude: Optional[float]


ItemT = TypeVar("ItemT")


class Dataset(BaseModel, Generic[ItemT]):
    model_config = ConfigDict(extra="forbid")

    status: DatasetStatus
    fetched_at: Optional[datetime] = Field(
        description=(
            "上流からの取得に最後に成功した時刻（UTC）。stale では前回成功時刻、error では null。"
            "前回成功から 15 分を過ぎた dataset は stale ではなく error になる"
        )
    )
    items: Optional[list[ItemT]] = Field(
        description="ok は今回の値（空配列 = 確認済みの 0 件）、stale は前回成功時の値、error は null"
    )

    @model_validator(mode="after")
    def _consistent(self):
        if self.status == DatasetStatus.error:
            if self.fetched_at is not None or self.items is not None:
                raise ValueError("error の dataset は fetched_at と items が null")
        elif self.fetched_at is None or self.items is None:
            raise ValueError(f"{self.status.value} の dataset は fetched_at と items が必須")
        return self


class EarthquakesDataset(Dataset[EarthquakeItem]):
    pass


class TsunamiDataset(Dataset[TsunamiItem]):
    pass


class VolcanoWarningsDataset(Dataset[VolcanoWarningItem]):
    pass


class SnapshotDatasets(BaseModel):
    model_config = ConfigDict(extra="forbid")

    earthquakes: EarthquakesDataset
    tsunami: TsunamiDataset
    volcano_warnings: VolcanoWarningsDataset


class Snapshot(BaseModel):
    """表示用データを 1 つにまとめたもの。気象警報（府県予報区 58 件）は含まない。"""

    model_config = ConfigDict(extra="forbid", title="JapanDisasterAlertSnapshot")

    schema_version: Literal["1.0"] = SCHEMA_VERSION
    generated_at: datetime = Field(description="この包みを作った時刻（UTC）。上流の発表時刻ではない")
    source: SnapshotSource
    datasets: SnapshotDatasets
