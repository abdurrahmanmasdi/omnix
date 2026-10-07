"""Offline fact-sheet loader, approval boundaries and offer safety."""
import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from langchain_core.messages import AIMessage, HumanMessage
from app.infrastructure import database_service
from app.modules.coordinator import coordinator
from app.modules.safety.policy import DeliverySafetyPolicy

ORG = '00000000-0000-4000-8000-000000000001'
NOW = datetime(2026, 10, 7, 12, tzinfo=timezone.utc)
ACTIVE = {'text': 'Special offer: complimentary airport transfer.', 'enabled': True, 'validFrom': '2026-10-07T12:00:00Z', 'validTo': '2026-10-08T12:00:00Z'}


@pytest.mark.parametrize('change,active', [
    ({}, True), ({'enabled': False}, False), ({'enabled': 'true'}, False),
    ({'validFrom': '2026-10-07T12:00:01Z'}, False),
    ({'validTo': '2026-10-07T11:59:59Z'}, False),
    ({'validFrom': '2026-10-07T15:00:00+03:00'}, True),
    ({'validFrom': '2026-10-07T12:00:00'}, False),
    ({'validTo': 'invalid'}, False), ({'validTo': None}, False),
])
def test_offer_filter_is_inclusive_and_does_not_mutate_facts(change, active):
    facts = {'offers': [{**ACTIVE, **change}], 'warranty': 'Synthetic warranty'}
    filtered = database_service.active_clinic_facts(facts, NOW)
    assert bool(filtered['offers']) is active
    assert filtered['warranty'] == facts['warranty']
    assert len(facts['offers']) == 1


@pytest.mark.parametrize('row', [None, {'version': 2, 'facts': {'offers': [], 'location': 'Approved synthetic clinic'}}])
def test_loader_sql_requires_request_tenant_and_approval(monkeypatch, row):
    calls = []
    class DB:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def execute(self, query, params):
            calls.append((str(query), params))
            return SimpleNamespace(mappings=lambda: SimpleNamespace(first=lambda: row))
    monkeypatch.setattr(database_service, 'SessionLocal', DB)
    loaded = asyncio.run(database_service.DatabaseService.get_approved_clinic_facts(ORG))
    assert loaded == ({'version': 2, 'offers': [], 'location': 'Approved synthetic clinic'} if row else None)
    sql, params = calls[0]
    assert '"organizationId" = :org_id' in sql and '"approvedAt" IS NOT NULL' in sql
    assert 'ORDER BY version DESC LIMIT 1' in sql and params == {'org_id': ORG}
    with pytest.raises(ValueError):
        asyncio.run(database_service.DatabaseService.get_approved_clinic_facts(''))


@pytest.mark.parametrize('approved', [None, {'version': 3, 'offers': [], 'location': 'Approved clinic'}])
def test_coordinator_uses_approved_sheet_or_legacy_fallback(monkeypatch, approved):
    sheet = AsyncMock(return_value=approved)
    knowledge = AsyncMock(return_value='Legacy knowledge')
    monkeypatch.setattr(coordinator.DatabaseService, 'get_approved_clinic_facts', sheet)
    monkeypatch.setattr(coordinator.DatabaseService, 'get_clinic_knowledge', knowledge)
    seen = []
    class Model:
        def bind_tools(self, tools): return self
        async def ainvoke(self, messages):
            seen.extend(messages)
            return AIMessage(content='Which treatment interests you?')
    monkeypatch.setattr(coordinator.LLMFactory, 'get_flagship_llm', lambda: Model())
    state = {'organization_id': ORG, 'messages': [HumanMessage(content='Hello')], 'customer': {}}
    asyncio.run(coordinator.run_coordinator(state, {'configurable': {'organization_id': ORG}}))
    sheet.assert_awaited_once_with(ORG)
    assert knowledge.await_count == int(approved is None)
    assert ('Approved clinic' if approved else 'Legacy knowledge') in seen[1].content


def test_only_exact_approved_offer_bypasses_discount_gate():
    text = 'Special offer: 10% off crowns.'
    assert not DeliverySafetyPolicy.check_output(text).allowed
    assert DeliverySafetyPolicy.check_output(text, [text]).allowed
    assert not DeliverySafetyPolicy.check_output(text + ' Also 50% off implants.', [text]).allowed
    assert not DeliverySafetyPolicy.check_output(text + ' Your appointment is confirmed.', [text]).allowed
    assert not DeliverySafetyPolicy.check_output(text + ' Act now!', [text]).allowed
    assert not DeliverySafetyPolicy.check_output('Special offer: you have an infection.', ['Special offer: you have an infection.']).allowed
