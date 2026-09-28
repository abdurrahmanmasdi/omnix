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
