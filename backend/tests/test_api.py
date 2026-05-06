import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.1.0"


@pytest.mark.asyncio
async def test_login_missing_fields(client: AsyncClient):
    resp = await client.post("/api/v1/auth/login", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_login_wrong_credentials(client: AsyncClient):
    resp = await client.post("/api/v1/auth/login", json={"username": "nonexistent", "password": "wrong"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_without_token(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_register_and_login(client: AsyncClient):
    user = {"username": f"test_{id(object())}", "password": "test123456", "real_name": "测试用户"}
    resp = await client.post("/api/v1/auth/register", json=user)
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["user_id"]

    resp2 = await client.post("/api/v1/auth/login", json={"username": user["username"], "password": user["password"]})
    assert resp2.status_code == 200
    assert "access_token" in resp2.json()


@pytest.mark.asyncio
async def test_companies_requires_auth(client: AsyncClient):
    resp = await client.get("/api/v1/organization/companies")
    assert resp.status_code == 403
