"""WP-C C2.5 (KI-033, KI-055): /health reports database and gRPC readiness."""
import asyncio
from unittest.mock import AsyncMock

import pytest

import main


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    monkeypatch.setattr(main, "_grpc_ready", False)


def _health(monkeypatch, db_ok: bool, grpc_ready: bool):
    if db_ok:
        monkeypatch.setattr(main.DatabaseService, "ping", AsyncMock(return_value=None))
    else:
        monkeypatch.setattr(main.DatabaseService, "ping", AsyncMock(side_effect=RuntimeError("db at secret-host down")))
    monkeypatch.setattr(main, "_grpc_ready", grpc_ready)
    response = main.Response()
    body = asyncio.run(main.health_check(response))
    return response.status_code, body


def test_ready_when_database_and_grpc_are_up(monkeypatch):
    assert _health(monkeypatch, True, True) == (200, {"status": "ok", "checks": {"database": "ok", "grpc": "ok"}})


def test_database_down_is_503_without_details(monkeypatch):
    status, body = _health(monkeypatch, False, True)
    assert status == 503
    assert body == {"status": "not_ready", "checks": {"database": "failed", "grpc": "ok"}}
    assert "secret-host" not in str(body)


def test_grpc_not_started_is_503(monkeypatch):
    status, body = _health(monkeypatch, True, False)
    assert status == 503
    assert body["checks"]["grpc"] == "failed"


def test_database_ping_uses_a_worker_thread(monkeypatch):
    from app.infrastructure.database_service import DatabaseService
    calls = []

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def execute(self, statement):
            calls.append(str(statement))

    monkeypatch.setattr("app.infrastructure.database_service.SessionLocal", FakeSession)
    asyncio.run(DatabaseService.ping())
    assert calls == ["SELECT 1"]
