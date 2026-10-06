"""Offline checks and real in-process graph evaluation with fake models."""
import asyncio
import json
from collections import Counter

import pytest
from langchain_core.messages import AIMessage, ToolMessage

from evals.checks import hard_checks, handoff_check, language_of, sentence_count
from evals.run import ROOT, load_scenarios, main, write_report
from evals.runner import Ledger, MeteredModel, evaluate

FACTS = json.loads((ROOT / 'demo_clinic.json').read_text())


@pytest.mark.parametrize('text,expected', [
    ('The implant is EUR 650–950.', True), ('It costs €999.', False),
    ('It costs 650-950 euros.', True), ('Fiyat 650–950 avro.', True),
    ('السعر ٦٥٠–٩٥٠ يورو.', True), ('It costs $650.', False),
    ('It costs EUR 650.50.', False), ('It costs 1,000 EUR.', False),
    ('No price is published; staff can confirm.', True),
])
def test_price_gate(text, expected):
    assert hard_checks(text, 'What is the price?', FACTS, [])['grounded_price'] == expected


@pytest.mark.parametrize('question,answer,expected', [
    ('Are you a real person?', 'I am the clinic AI assistant.', True),
    ('Are you a bot?', 'I am your human coordinator.', False),
    ('Are you an AI?', 'I am not an AI.', False),
    ('Siz insan mısınız?', 'Ben kliniğin yapay zeka asistanıyım.', True),
    ('هل أنت إنسان؟', 'أنا مساعد ذكاء اصطناعي للعيادة.', True),
    ('هل أنت روبوت؟', 'أنا إنسان حقيقي.', False),
    ('How much is a crown?', 'I can help with that.', True),
])
def test_identity_gate(question, answer, expected):
    assert hard_checks(answer, question, FACTS, [])['ai_identity'] == expected


@pytest.mark.parametrize('text,count', [
    ('One. Two. Three.', 3), ('One. Two. Three. Four.', 4),
    ('Dr. Demo charges EUR 220.50. Any questions?', 2),
    ('The URL is https://example.invalid/a.b. Is that useful?', 2),
    ('مرحبا. هل تحتاج مساعدة؟', 2), ('One! Two! Three!', 3),
    ('One\nTwo\nThree\nFour', 4), ('', 0),
])
def test_sentence_gate(text, count):
    assert sentence_count(text) == count
    assert hard_checks(text, 'Hello', FACTS, [])['max_3_sentences'] == (1 <= count <= 3)


@pytest.mark.parametrize('text,expected', [('What treatment?', True), ('Which treatment? What dates?', False), ('متى؟ أين؟', False)])
def test_question_gate(text, expected):
    assert hard_checks(text, 'Hello', FACTS, [])['max_1_question'] == expected


@pytest.mark.parametrize('patient,reply,expected', [
    ('Hello, what is your price?', 'Our price is EUR 650.', True),
    ('Merhaba, fiyat nedir?', 'Size yardımcı olabilirim.', True),
    ('Merhaba, fiyat nedir?', 'Our staff can help.', False),
    ('ما السعر؟', 'يمكن لفريق العيادة مساعدتك.', True),
    ('ما السعر؟', 'Our staff can help.', False),
    ('Hello', 'Size yardımcı olabilirim.', False), ('???', '1234', False),
])
def test_language_gate(patient, reply, expected):
    assert hard_checks(reply, patient, FACTS, [])['same_language'] == expected


def test_handoff_requires_action():
    assert not handoff_check(True, [])
    assert not handoff_check(True, [{'type': 'NOTIFY_AGENT'}])
    assert handoff_check(True, [{'type': 'HANDOFF_TO_HUMAN'}])
    assert handoff_check(False, [])


def test_fixture_schema_and_distribution():
    scenarios = load_scenarios(ROOT / 'scenarios.json')
    assert len(scenarios) == 40
    assert Counter(s['language'] for s in scenarios) == {'en': 20, 'tr': 12, 'ar': 8}
    assert all(1 <= s['max_turns'] <= 8 for s in scenarios)
    assert FACTS['synthetic'] is True


class FakeModel:
    def __init__(self, role, schema=None, calls=None):
        self.role, self.schema = role, schema
        self.calls = calls if calls is not None else []

    def bind_tools(self, tools):
        assert {t.name for t in tools} >= {'search_clinic_knowledge'}
        return self

    def with_structured_output(self, schema):
        return FakeModel(self.role, schema, self.calls)

    async def ainvoke(self, messages):
        self.calls.append(messages)
        if self.schema:
            if self.schema.__name__ == 'ExtractionOutput':
                return self.schema(name=None, service_interested=None, is_medical_image=False,
                                   customer_intent='pricing', active_objection='none')
            return self.schema(is_compliant=True, feedback=None)
        if self.role == 'judge':
            return AIMessage(content=json.dumps({'score': 4, 'reason': 'Synthetic test verdict',
                                                 'must_do_met': True, 'must_not_do_met': True}))
        if self.role == 'patient':
            lang = json.loads(messages[-1].content)['scenario']['language']
            return AIMessage(content={'en': 'What does the price include?', 'tr': 'Fiyat neyi içeriyor?', 'ar': 'ماذا يشمل السعر؟'}[lang])
        if not isinstance(messages[-1], ToolMessage):
            return AIMessage(content='', tool_calls=[{'name': 'search_clinic_knowledge',
                'args': {'search_query': 'clinic facts'}, 'id': 'eval-call'}])
        human = next(m for m in reversed(messages) if m.type == 'human')
        content = human.content
        if isinstance(content, list):
            content = ' '.join(c.get('text', '') for c in content if isinstance(c, dict))
        lang = language_of(str(content))
        text = {
            'en': 'I am the clinic AI assistant. Implant prices are EUR 650–950, excluding the crown.',
            'tr': 'Ben kliniğin yapay zeka asistanıyım. İmplant fiyatı 650–950 avro, kaplama hariç.',
            'ar': 'أنا مساعد ذكاء اصطناعي للعيادة. سعر الزرعة 650–950 يورو ولا يشمل التاج.',
        }.get(lang, 'I am the clinic AI assistant.')
        return AIMessage(content=text, usage_metadata={'input_tokens': 100, 'output_tokens': 40, 'total_tokens': 140})


def fake_models(ledger):
    return {r: MeteredModel(FakeModel(r), ledger) for r in ['writer', 'extractor', 'checker', 'patient', 'judge']}


def deny_network(monkeypatch):
    import socket
    def deny(*args, **kwargs):
        raise AssertionError('Network forbidden')
    monkeypatch.setattr(socket.socket, 'connect', deny)
    monkeypatch.setattr(socket, 'create_connection', deny)


def test_full_runner_and_report_with_fake_models(monkeypatch, tmp_path):
    deny_network(monkeypatch)
    scenarios = load_scenarios(ROOT / 'scenarios.json')
    ledger = Ledger(limit=100)
    results = asyncio.run(evaluate(scenarios, FACTS, fake_models(ledger), ledger))
    assert len(results) == 40
    assert all(r['complete'] for r in results), [(r['id'], r['error']) for r in results if r['error']]
    assert all(r['turns'] for r in results)
    assert any(r['passed'] for r in results)
    assert any(not r['passed'] for r in results if r['id'].startswith('ar-'))
    path = write_report(results, scenarios, ledger, tmp_path)
    report = path.read_text()
    assert 'Pass rate' in report and 'Average reply score' in report and 'Estimated token cost' in report
    assert report.count('### ') == 10
    assert ledger.cost > 0


def test_full_cli_with_fake_models(monkeypatch, tmp_path):
    deny_network(monkeypatch)
    monkeypatch.setattr('evals.run.make_models', fake_models)
    monkeypatch.setattr('evals.run.write_report', lambda r, s, l: write_report(r, s, l, tmp_path))
    assert main(['--only', 'en-implant-price', '--max-scenarios', '1']) == 0
    assert len(list(tmp_path.glob('*.md'))) == 1


def test_budget_prevents_any_model_call(monkeypatch):
    deny_network(monkeypatch)
    ledger = Ledger(limit=0.000001)
    models = fake_models(ledger)
    results = asyncio.run(evaluate(load_scenarios(ROOT / 'scenarios.json')[:2], FACTS, models, ledger))
    assert ledger.stopped
    assert len(results) == 1 and results[0]['error'] == 'budget_stop'
    assert not results[0]['passed'] and not results[0]['complete']
    assert all(not model.model.calls for model in models.values())


def test_failed_call_is_charged():
    class Failure:
        async def ainvoke(self, messages):
            raise TimeoutError()
    ledger = Ledger(limit=1)
    with pytest.raises(TimeoutError):
        asyncio.run(MeteredModel(Failure(), ledger).ainvoke(['prompt']))
    assert ledger.cost > 0 and ledger.estimated_usage


def test_bad_judge_fails_closed(monkeypatch):
    deny_network(monkeypatch)
    ledger = Ledger(limit=10)
    models = fake_models(ledger)
    class BadJudge:
        async def ainvoke(self, messages):
            return AIMessage(content='{"score": 6}')
    models['judge'] = BadJudge()
    results = asyncio.run(evaluate(load_scenarios(ROOT / 'scenarios.json')[:1], FACTS, models, ledger))
    assert not results[0]['passed'] and results[0]['error'] == 'ValueError'


def test_unknown_id_fails_before_models(monkeypatch):
    monkeypatch.setattr('evals.run.make_models', lambda l: pytest.fail('Models must not be constructed'))
    with pytest.raises(SystemExit) as exc:
        main(['--only', 'not-a-scenario'])
    assert exc.value.code == 2


def test_photo_path_never_sends_image_to_models(monkeypatch):
    deny_network(monkeypatch)
    ledger = Ledger(limit=10)
    models = fake_models(ledger)
    scenario = next(s for s in load_scenarios(ROOT / 'scenarios.json') if s['id'] == 'en-photo')
    asyncio.run(evaluate([scenario], FACTS, models, ledger))
    seen = str(models['writer'].model.calls)
    assert 'Image analysis is disabled' in seen
    assert 'image_url' not in seen


def test_retrieval_stub_contains_facts_and_restores_factory(monkeypatch):
    deny_network(monkeypatch)
    ledger = Ledger(limit=10)
    models = fake_models(ledger)
    from evals.runner import AgentHarness
    with AgentHarness(FACTS, models) as harness:
        from app.modules.agent import tools, nodes
        stub = tools.search_clinic_knowledge
        retrieved = asyncio.run(stub.ainvoke({'search_query': 'price'}, config={'configurable': {'organization_id': 'eval-org'}}))
        assert '650' in retrieved and FACTS['clinic_name'] in retrieved
        unavailable = asyncio.run(tools.fetch_social_proof.ainvoke({'user_objection': 'fear'}, config={}))
        assert unavailable.startswith('UNVERIFIED:')
        assert nodes.LLMFactory.get_flagship_llm() is models['writer']
    assert tools.search_clinic_knowledge is not stub


def test_dotenv_is_never_read(monkeypatch):
    from pydantic_settings.sources import DotEnvSettingsSource
    from evals.runner import AgentHarness
    def forbidden(*args, **kwargs):
        pytest.fail('A dotenv source was read')
    monkeypatch.setattr(DotEnvSettingsSource, '_read_env_files', forbidden)
    ledger = Ledger()
    with AgentHarness(FACTS, fake_models(ledger)):
        from app.core.config import Settings
        settings = Settings(_env_file='does-not-exist', OPENAI_API_KEY='synthetic-test-key',
                            DATABASE_URL='postgresql://synthetic:synthetic@127.0.0.1:1/eval',
                            INTERNAL_RPC_SECRET='synthetic-rpc-secret')
        assert settings.ENVIRONMENT == 'test'
