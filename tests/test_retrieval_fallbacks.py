import asyncio
from types import SimpleNamespace

import pytest

from app.modules.agent import tools


class FakeEmbeddings:
    def __init__(self, **kwargs):
        pass

    async def aembed_query(self, query):
        return [0.1, 0.2]


@pytest.mark.parametrize("tool_name", ["fetch_social_proof", "fetch_battlecard"])
@pytest.mark.parametrize("failure", [False, True])
def test_empty_or_failed_retrieval_makes_no_outcome_claim(monkeypatch, tool_name, failure):
    class FakeDb:
        def execute(self, statement, params):
            if failure:
                raise RuntimeError("provider exception with patient context")
            return SimpleNamespace(fetchone=lambda: None)

        def close(self):
            pass

    monkeypatch.setattr(tools, "SessionLocal", FakeDb)
    monkeypatch.setattr(tools, "OpenAIEmbeddings", FakeEmbeddings)
    selected = getattr(tools, tool_name)
    result = asyncio.run(selected.coroutine(
        "question", config={"configurable": {"organization_id": "org-s12"}}
    ))
    assert result.startswith("UNVERIFIED:")
    assert "guarantee" not in result.lower()
    assert "success rate" not in result.lower()
    assert "premium quality" not in result.lower()


BATTLECARD_COLUMNS = {"id", "organizationId", "competitorName", "objectionType", "rebuttalText", "embedding", "createdAt", "updatedAt"}


def _schema_model_fields(model_name):
    """Field names of a Prisma model in the sibling backend repo, if present."""
    import re
    from pathlib import Path
    schema = Path(__file__).resolve().parents[2] / "backend-v2" / "prisma" / "schema.prisma"
    if not schema.exists():
        return None
    block = re.search(r"model " + model_name + r" \{(.*?)\n\}", schema.read_text(), re.S).group(1)
    return {line.split()[0] for line in block.splitlines() if line.strip() and not line.strip().startswith(("//", "@@"))}


def test_battlecard_sql_uses_only_existing_columns(monkeypatch):
    # WP-A A9 (KI-046): the query used a non-existent consentObtained column,
    # so every competitor/price objection ended in a handoff.
    import re
    seen = {}

    class FakeDb:
        def execute(self, statement, params):
            seen["sql"] = str(statement)
            seen["params"] = params
            return SimpleNamespace(fetchone=lambda: SimpleNamespace(
                competitorName="Clinic X", objectionType="PRICE", rebuttalText="Compare what each quote includes.",
            ))

        def close(self):
            pass

    monkeypatch.setattr(tools, "SessionLocal", FakeDb)
    monkeypatch.setattr(tools, "OpenAIEmbeddings", FakeEmbeddings)
    result = asyncio.run(tools.fetch_battlecard.coroutine(
        "Clinic X is cheaper", config={"configurable": {"organization_id": "org-a9"}}
    ))
    assert not result.startswith("UNVERIFIED:")
    assert "Compare what each quote includes." in result
    sql = seen["sql"]
    referenced = set(re.findall(r'"([A-Za-z_]+)"', sql)) | ({"embedding"} if "embedding" in sql else set())
    assert referenced <= BATTLECARD_COLUMNS, referenced - BATTLECARD_COLUMNS
    assert "consentObtained" not in sql
    assert '"organizationId" = :org_id' in sql and seen["params"]["org_id"] == "org-a9"
    schema_fields = _schema_model_fields("OrganizationBattlecard")
    if schema_fields is not None:
        assert referenced <= schema_fields, referenced - schema_fields
