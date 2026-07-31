"""設定読み込みからの秘密漏洩経路を塞いだことの回帰テスト

## 背景（2026-07-30 のインシデント）

`Settings` は `env_file=(Path.home() / ".env.local", ".env")` でユーザーの
**グローバル env ファイル**を読んでいた。そこには他プロジェクトの API キーが
入っており、`extra` 未指定（pydantic-settings の既定は `forbid`）のため
**無関係なキーがあるだけで `ValidationError`** になった。

さらに悪いことに、`extra_forbidden` のエラーメッセージは
`input_value=<実際の値>` を**平文で出力する**。結果、開発中に何気なく
`python -c "import app..."` を実行しただけで API キー9件が端末に出力された。

このテストは以下2点を固定する:
  1. 無関係な環境変数があっても `Settings()` は落ちない（＝値を吐くエラーが起きない）
  2. ユーザーのホームディレクトリの env ファイルを読まない（最小権限）
"""
from pathlib import Path

import pytest
from pydantic_settings import BaseSettings

from app.config import Settings


class TestNoValidationErrorOnUnrelatedEnv:
    """無関係な環境変数で落ちない = 値を吐くエラー経路が存在しない"""

    def test_無関係なキーを含む_env_ファイルでも設定が読める(self, tmp_path, monkeypatch):
        """**これが本番の再現経路。**

        漏洩は「環境変数」ではなく「env ファイル」から起きた。
        pydantic-settings の `EnvSettingsSource` はフィールド名に一致する環境変数しか
        拾わないが、`DotEnvSettingsSource` は **env ファイルの全行を入力として渡す**。
        そのため `extra="forbid"` だと無関係な行があるだけで `ValidationError` になり、
        メッセージに `input_value=<実際の値>` が載る。
        """
        monkeypatch.chdir(tmp_path)
        (tmp_path / ".env").write_text(
            "OPENAI_API_KEY=unrelated-value-must-not-leak\n"
            "REDDIT_CLIENT_SECRET=unrelated-value-must-not-leak\n"
            "LINE_CHANNEL_ACCESS_TOKEN=unrelated-value-must-not-leak\n",
            encoding="utf-8",
        )

        settings = Settings()  # 例外が出ないこと自体が検証内容
        assert settings is not None

    def test_無関係な環境変数があっても設定が読める(self, monkeypatch):
        monkeypatch.setenv("SOME_UNRELATED_KEY", "unrelated-value-must-not-leak")

        settings = Settings()
        assert settings is not None

    def test_無関係な環境変数は設定に取り込まれない(self, monkeypatch):
        """`extra="ignore"` は保持もしない。取り込むと別経路で漏れうる。"""
        monkeypatch.setenv("SOME_UNRELATED_SECRET", "unrelated-value-must-not-leak")

        settings = Settings()
        dumped = settings.model_dump()
        assert "some_unrelated_secret" not in dumped
        assert "unrelated-value-must-not-leak" not in repr(dumped)

    def test_extra_が_ignore_に設定されている(self):
        """既定の forbid に戻ると、無関係キーで落ちて値を吐くようになる。"""
        assert Settings.model_config.get("extra") == "ignore"


class TestDoesNotReadHomeEnvFile:
    """ユーザーのグローバル env を読まない（最小権限）"""

    def test_env_file_にホームディレクトリを含まない(self):
        env_file = Settings.model_config.get("env_file")
        entries = [env_file] if isinstance(env_file, (str, Path)) else list(env_file or [])

        home = str(Path.home())
        for entry in entries:
            assert home not in str(entry), (
                f"env_file がホームを参照している: {entry!r}。"
                "他プロジェクトのキーを読み込む構成は最小権限に反する"
            )

    def test_env_file_はリポジトリ内の相対パスのみ(self):
        env_file = Settings.model_config.get("env_file")
        entries = [env_file] if isinstance(env_file, (str, Path)) else list(env_file or [])

        assert entries, "env_file が空"
        for entry in entries:
            assert not Path(entry).is_absolute(), f"絶対パス参照: {entry!r}"

    def test_ホームの_env_local_の値が設定に混入しない(self, tmp_path, monkeypatch):
        """ホームを差し替えても、そこの値を拾わないこと。"""
        fake_home = tmp_path / "fake-home"
        fake_home.mkdir()
        (fake_home / ".env.local").write_text(
            "GEMINI_API_KEY=value-from-home-must-not-be-used\n", encoding="utf-8"
        )
        monkeypatch.setattr(Path, "home", classmethod(lambda cls: fake_home))
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)

        settings = Settings()
        assert settings.gemini_api_key != "value-from-home-must-not-be-used"


class TestSettingsStillWorks:
    """塞いだ結果、本来の設定読み込みが壊れていないこと"""

    def test_環境変数からは従来どおり読める(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "from-environment")
        assert Settings().gemini_api_key == "from-environment"

    def test_pydantic_settings_のサブクラスである(self):
        assert issubclass(Settings, BaseSettings)

    @pytest.mark.parametrize("field", ["environment", "jma_base_url"])
    def test_主要フィールドが既定値を持つ(self, field):
        assert getattr(Settings(), field) is not None
