"""Offline checks and real in-process graph evaluation with fake models."""
import asyncio
import json
from collections import Counter

import pytest
from langchain_core.messages import AIMessage, ToolMessage

from evals.checks import hard_checks, handoff_check, language_of, sentence_count
from evals.run import ROOT, load_scenarios, main, write_report
from evals.runner import Ledger, MeteredModel, agent_facts, evaluate

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
    assert len(scenarios) == 55
    assert Counter(s['language'] for s in scenarios) == {'en': 28, 'tr': 15, 'ar': 12}
    assert all(1 <= s['max_turns'] <= 8 for s in scenarios)
    assert FACTS['synthetic'] is True


class FakeModel:
    def __init__(self, role, schema=None, calls=None):
        self.role, self.schema = role, schema
        self.calls = calls if calls is not None else []

    def bind_tools(self, tools):
        self.tools = {t.name for t in tools}
        assert self.tools & {'search_clinic_knowledge', 'escalate_to_human'}
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
            lang = language_of(messages[-1].content)
            return AIMessage(content={'en': 'What does the price include?', 'tr': 'Fiyat neyi içeriyor?', 'ar': 'ماذا يشمل السعر؟'}[lang])
        v2 = 'Guidelines:' in messages[0].content
        if v2:
            data = json.loads(next(m.content for m in messages if m.type == 'human' and '"label": "recent messages"' in m.content))['data']
            content = next(m['content'] for m in reversed(data) if m['role'] == 'human')
            if isinstance(content, list):
                content = ' '.join(c.get('text', '') for c in content if isinstance(c, dict))
            lang = language_of(str(content))
            return AIMessage(content={
                'en': 'I am the clinic AI assistant. Implant prices are EUR 650–950, excluding the crown.',
                'tr': 'Ben kliniğin yapay zeka asistanıyım. İmplant fiyatı 650–950 avro, kaplama hariç.',
                'ar': 'أنا مساعد ذكاء اصطناعي للعيادة. سعر الزرعة 650–950 يورو ولا يشمل التاج.',
            }.get(lang, 'I am the clinic AI assistant.'))
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


@pytest.mark.parametrize('agent', ['v1', 'v2'])
def test_full_runner_and_report_with_fake_models(monkeypatch, tmp_path, agent):
    deny_network(monkeypatch)
    scenarios = load_scenarios(ROOT / 'scenarios.json')
    ledger = Ledger(limit=100)
    results = asyncio.run(evaluate(scenarios, FACTS, fake_models(ledger), ledger, agent=agent))
    assert len(results) == 55
    assert all(r['complete'] for r in results), [(r['id'], r['error']) for r in results if r['error']]
    assert all(r['turns'] for r in results)
    assert any(r['passed'] for r in results)
    if agent == 'v1':
        assert any(not r['passed'] for r in results if r['id'].startswith('ar-'))
    path = write_report(results, scenarios, ledger, tmp_path)
    report = path.read_text()
    assert 'Pass rate' in report and 'Average reply score' in report and 'Estimated token cost' in report
    assert report.count('### ') == 10
    assert ledger.cost > 0


@pytest.mark.parametrize('agent', ['v1', 'v2'])
def test_full_cli_with_fake_models(monkeypatch, tmp_path, agent):
    deny_network(monkeypatch)
    monkeypatch.setattr('evals.run.make_models', fake_models)
    monkeypatch.setattr('evals.run.write_report', lambda r, s, l: write_report(r, s, l, tmp_path))
    assert main(['--agent', agent, '--only', 'en-implant-price', '--max-scenarios', '1']) == 0
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
        assert '650' in retrieved and agent_facts(FACTS)['clinic_name'] in retrieved
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


@pytest.mark.parametrize('prefix', ['FLAGSHIP', 'EXTRACTOR', 'CHEAP', 'EVAL_PATIENT', 'EVAL_JUDGE'])
def test_eval_model_options_are_per_role(monkeypatch, prefix):
    from evals.run import make_models
    names = ['FLAGSHIP', 'EXTRACTOR', 'CHEAP', 'EVAL_PATIENT', 'EVAL_JUDGE']
    monkeypatch.setenv('OPENAI_API_KEY', 'synthetic-key')
    for name in names:
        monkeypatch.setenv(name + '_MODEL', name)
        monkeypatch.setenv(name + '_TEMPERATURE', '')
        monkeypatch.setenv(name + '_REASONING_EFFORT', '')
    monkeypatch.setenv(prefix + '_TEMPERATURE', '0')
    monkeypatch.setenv(prefix + '_REASONING_EFFORT', 'low')
    captured = []
    monkeypatch.setattr('langchain_openai.ChatOpenAI', lambda **kw: captured.append(kw))
    make_models(Ledger())
    for kw in captured:
        if kw['model'] == prefix:
            assert kw['temperature'] == 0 and kw['model_kwargs'] == {'reasoning_effort': 'low'}
        else:
            assert 'temperature' not in kw and 'model_kwargs' not in kw
    monkeypatch.setenv(prefix + '_TEMPERATURE', 'nan')
    with pytest.raises(ValueError):
        make_models(Ledger())
    assert len(captured) == 5


def test_patient_perspective_and_rubric():
    from evals.runner import patient_messages, RUBRIC
    scenario = load_scenarios(ROOT / 'scenarios.json')[0]
    messages = patient_messages(scenario, [{'patient': 'How much?', 'reply': 'Our crowns cost EUR 220–320.'}])
    assert [m.type for m in messages] == ['system', 'ai', 'human']
    assert messages[1].content == 'How much?'
    assert messages[2].content.startswith('Our crowns')
    assert 'ONLY the fictional PATIENT' in messages[0].content
    assert 'ONLY when the patient asks' in RUBRIC
    assert 'must explain why' in RUBRIC


def test_provider_error_is_reported_without_keys(monkeypatch, tmp_path):
    monkeypatch.setenv('OPENAI_API_KEY', 'synthetic-private-key')
    ledger = Ledger(limit=10)
    models = fake_models(ledger)
    class Failure:
        async def ainvoke(self, messages):
            raise ValueError('Unsupported reasoning_effort; key synthetic-private-key sk-secret-token')
    models['judge'] = MeteredModel(Failure(), ledger)
    scenarios = load_scenarios(ROOT / 'scenarios.json')[:1]
    results = asyncio.run(evaluate(scenarios, FACTS, models, ledger))
    report = write_report(results, scenarios, ledger, tmp_path).read_text()
    assert 'Unsupported reasoning_effort' in report
    assert 'synthetic-private-key' not in report and 'sk-secret-token' not in report


@pytest.mark.parametrize('agent', ['v1', 'v2'])
def test_servicer_swallowed_provider_error_still_in_report(monkeypatch, tmp_path, agent):
    deny_network(monkeypatch)
    ledger = Ledger(limit=10)
    class Failure(FakeModel):
        async def ainvoke(self, messages):
            raise ValueError('Unsupported model parameter (synthetic provider error)')
    models = fake_models(ledger)
    models['writer'] = MeteredModel(Failure('writer'), ledger)
    scenarios = load_scenarios(ROOT / 'scenarios.json')[:1]
    results = asyncio.run(evaluate(scenarios, FACTS, models, ledger, agent=agent))
    assert not results[0]['passed']
    assert any(a['type'] == 'HANDOFF_TO_HUMAN' for a in results[0]['turns'][0]['actions'])
    assert 'Unsupported model parameter' in write_report(results, scenarios, ledger, tmp_path).read_text()


@pytest.mark.parametrize('reply,allowed', [
    ('Your appointment is confirmed.', False), ("You're booked for Monday.", False),
    ('Randevunuz onaylandı.', False), ('تم تأكيد موعدك.', False),
    ('The clinic team will confirm the time.', True),
])
def test_confirmation_hard_gate(reply, allowed):
    assert hard_checks(reply, 'Hello', FACTS, [])['no_appointment_confirmation'] == allowed


def test_injections_require_no_automatic_handoff(monkeypatch):
    deny_network(monkeypatch)
    scenarios = [s for s in load_scenarios(ROOT / 'scenarios.json') if 'injection' in s['id']]
    ledger = Ledger(limit=100)
    models = fake_models(ledger)
    results = asyncio.run(evaluate(scenarios, FACTS, models, ledger, agent='v2'))
    assert len(results) == 5
    assert all(r['passed'] for r in results)
    assert not models['writer'].model.calls
    assert all(t['checks']['no_automatic_handoff'] and not t['actions'] for r in results for t in r['turns'])


def test_fact_sheet_scenarios_execute_tools_with_fake_model(monkeypatch):
    deny_network(monkeypatch)
    class FactModel(FakeModel):
        async def ainvoke(self, messages):
            self.calls.append(messages)
            if isinstance(messages[-1], ToolMessage):
                return AIMessage(content='I am passing this question to the clinic team.')
            recent = json.loads(next(m.content for m in messages if '"label": "recent messages"' in m.content))['data']
            patient_turns = [m for m in recent if m['role'] == 'human' and m['name'] != 'untrusted_data']
            latest = patient_turns[-1]['content']
            if isinstance(latest, list):
                latest = ' '.join(c.get('text', '') for c in latest if isinstance(c, dict))
            if 'discount' in latest.lower() or len(patient_turns) > 1:
                return AIMessage(content='', tool_calls=[{'name': 'escalate_to_human',
                    'args': {'reason': 'Discount request' if 'discount' in latest.lower() else 'Missing warranty after clarification', 'summary': latest}, 'id': 'fact-call'}])
            facts = json.loads(next(m.content for m in messages if '"label": "clinic knowledge"' in m.content))['data']
            if 'warranty' in latest.lower():
                return AIMessage(content='Which treatment warranty are you asking about?')
            return AIMessage(content=facts['offers'][0]['text'] if facts['offers'] else 'No active offer is listed.')
    class Patient(FakeModel):
        async def ainvoke(self, messages):
            return AIMessage(content='I mean your implant warranty.')
    ledger = Ledger(limit=100)
    models = fake_models(ledger)
    model = FactModel('writer')
    models['writer'] = MeteredModel(model, ledger)
    models['patient'] = MeteredModel(Patient('patient'), ledger)
    scenarios = [s for s in load_scenarios(ROOT / 'scenarios.json') if s.get('fact_sheet_variant')]
    results = asyncio.run(evaluate(scenarios, FACTS, models, ledger, agent='v2'))
    assert len(results) == 4
    assert all(r['passed'] for r in results), [(r['id'], r) for r in results if not r['passed']]
    missing = next(r for r in results if r['id'] == 'en-fact-missing')
    assert not missing['turns'][0]['actions']
    assert any(a['type'] == 'HANDOFF_TO_HUMAN' for a in missing['turns'][1]['actions'])
    assert any(a['type'] == 'UPDATE_SUMMARY' for a in missing['turns'][1]['actions'])
