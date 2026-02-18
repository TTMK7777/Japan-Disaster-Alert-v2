import pytest
from httpx import AsyncClient

# pytest-asyncioを使用して非同期テストを実行
pytestmark = pytest.mark.asyncio

async def test_root_health_check(client: AsyncClient):
    """ヘルスチェックエンドポイントのテスト"""
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "timestamp" in data
    assert data["service"] == "災害対応AIエージェント"

async def test_get_languages(client: AsyncClient):
    """対応言語一覧取得のテスト"""
    response = await client.get("/api/v1/languages")
    assert response.status_code == 200
    data = response.json()
    assert "ja" in data
    assert "en" in data
    assert data["ja"] == "日本語"

async def test_404_not_found(client: AsyncClient):
    """存在しないエンドポイントへのアクセステスト"""
    response = await client.get("/api/v1/non_existent_endpoint")
    assert response.status_code == 404
