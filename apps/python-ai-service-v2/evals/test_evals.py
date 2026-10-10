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
    return {r: MeteredModel(FakeModel(r), ledger, role=r, model_id=(ledger.manifest or {}).get('models', {}).get(r, {}).get('model', 'fake-' + r)) for r in ['writer', 'extractor', 'checker', 'patient', 'judge']}


def deny_network(monkeypatch):
    import socket
    def deny(*args, **kwargs):
        raise AssertionError('Network forbidden')
    monkeypatch.setattr(socket.socket, 'connect', deny)
    monkeypatch.setattr(socket, 'create_connection', deny)
    monkeypatch.setattr(socket.socket, 'connect_ex', deny)
    monkeypatch.setattr(socket, 'getaddrinfo', deny)


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
    configure_eval(monkeypatch)
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
    models['writer'] = MeteredModel(model, ledger, role='writer', model_id='fake-writer')
    models['patient'] = MeteredModel(Patient('patient'), ledger)
    scenarios = [s for s in load_scenarios(ROOT / 'scenarios.json') if s.get('fact_sheet_variant')]
    results = asyncio.run(evaluate(scenarios, FACTS, models, ledger, agent='v2'))
    assert len(results) == 4
    assert all(r['passed'] for r in results), [(r['id'], r) for r in results if not r['passed']]
    smoke_tool = next(r for r in results if r['id'] == 'en-offer-discount')
    assert smoke_tool['agent_turns'][0]['writer_calls'] == 2
    assert any(a['type'] == 'HANDOFF_TO_HUMAN' for a in smoke_tool['actions'])
    assert ledger.roles['writer']['tool_calls'] >= 1
    assert ledger.roles['extractor']['calls'] == ledger.roles['checker']['calls'] == 0
    missing = next(r for r in results if r['id'] == 'en-fact-missing')
    assert not missing['turns'][0]['actions']
    assert any(a['type'] == 'HANDOFF_TO_HUMAN' for a in missing['turns'][1]['actions'])
    assert any(a['type'] == 'UPDATE_SUMMARY' for a in missing['turns'][1]['actions'])


# AI-3c: configuration and manifest tests never require account access.
def configure_eval(monkeypatch, writer='gpt-6-luna'):
    from evals.run import NAMES
    for role, name in NAMES.items():
        prefix = name.removesuffix('_MODEL')
        monkeypatch.setenv(name, writer if role == 'writer' else 'gpt-6-luna')
        monkeypatch.setenv(prefix + '_REASONING_EFFORT', 'none')
        monkeypatch.setenv(prefix + '_TEMPERATURE', {'writer': '0.3', 'extractor': '0.1',
                                                   'checker': '0', 'patient': '0.3', 'judge': '0'}[role])
        for kind in ('INPUT', 'OUTPUT'):
            monkeypatch.delenv(f'EVAL_{role.upper()}_{kind}_USD_PER_MILLION', raising=False)
    for kind in ('INPUT', 'OUTPUT'):
        monkeypatch.delenv(f'EVAL_{kind}_USD_PER_MILLION', raising=False)


def test_preflight_allowlist_no_clients_key_dotenv(monkeypatch, capsys):
    deny_network(monkeypatch)
    configure_eval(monkeypatch, 'gpt-6-sol')
    monkeypatch.setenv('FLAGSHIP_TEMPERATURE', '')
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.setenv('DATABASE_URL', 'must-never-be-displayed')
    from pydantic_settings.sources import DotEnvSettingsSource
    def forbidden(*args, **kwargs):
        pytest.fail('Client or dotenv accessed in preflight')
    monkeypatch.setattr(DotEnvSettingsSource, '_read_env_files', forbidden)
    monkeypatch.setattr('evals.run.make_models', forbidden)
    assert main(['--agent', 'v2', '--label', 'offline', '--preflight']) == 0
    output = capsys.readouterr().out
    doc = json.loads(output)
    assert len(doc['selected']) == 55
    assert doc['models']['writer']['temperature'] is None
    assert doc['models']['writer']['reasoning_effort'] == 'none'
    assert 'must-never-be-displayed' not in output and 'OPENAI_API_KEY' not in output
    assert doc['source']['established']
    assert 'untested' in doc['compatibility']
    assert all('.env' not in name and 'reports' not in name for name in doc['source']['hashes'])


def test_preflight_rejects_changed_fixture_and_bad_selection(monkeypatch):
    configure_eval(monkeypatch)
    original = load_scenarios(ROOT / 'scenarios.json')
    monkeypatch.setattr('evals.run.load_scenarios', lambda p: original[:-1])
    with pytest.raises(SystemExit) as exc:
        main(['--agent', 'v2', '--preflight'])
    assert exc.value.code == 2
    monkeypatch.setattr('evals.run.load_scenarios', lambda p: original)
    with pytest.raises(SystemExit) as exc:
        main(['--only', 'en-implant-price,en-implant-price', '--preflight'])
    assert exc.value.code == 2


def test_source_identity_failure_is_ineligible(monkeypatch):
    from evals.reporting import source_identity
    def fail(*args, **kwargs):
        raise OSError('git unavailable')
    monkeypatch.setattr('evals.reporting.subprocess.run', fail)
    identity = source_identity()
    assert not identity['established'] and not identity['selection_eligible']


def test_partial_json_sidecar(monkeypatch, tmp_path):
    deny_network(monkeypatch)
    scenarios = load_scenarios(ROOT / 'scenarios.json')[:2]
    ledger = Ledger(limit=0.000001)
    results = asyncio.run(evaluate(scenarios, FACTS, fake_models(ledger), ledger))
    path = write_report(results, scenarios, ledger, tmp_path)
    doc = json.loads(path.with_suffix('.json').read_text())
    assert doc['schema_version'] == 1
    assert doc['aggregate']['selected'] == 2 and doc['aggregate']['attempted'] == 1
    assert doc['aggregate']['completed'] == 0 and doc['aggregate']['unrun'] == 1
    assert doc['aggregate']['pass_rate'] == 0
    assert doc['accounting']['budget_stopped']


@pytest.mark.parametrize('bad', ['0', '-1', 'nan', 'inf', ''])
def test_role_rate_validation_before_clients(monkeypatch, bad):
    configure_eval(monkeypatch)
    monkeypatch.setenv('EVAL_WRITER_INPUT_USD_PER_MILLION', bad)
    monkeypatch.setenv('EVAL_WRITER_OUTPUT_USD_PER_MILLION', '10')
    monkeypatch.setattr('evals.run.make_models', lambda l: pytest.fail('Invalid rates constructed models'))
    with pytest.raises(SystemExit) as exc:
        main(['--preflight'])
    assert exc.value.code == 2


def test_role_rate_half_pair_and_origins(monkeypatch):
    from evals.run import resolved_configuration
    configure_eval(monkeypatch)
    assert resolved_configuration()[1]['writer']['origin'] == 'illustrative'
    monkeypatch.setenv('EVAL_INPUT_USD_PER_MILLION', '2')
    monkeypatch.setenv('EVAL_OUTPUT_USD_PER_MILLION', '10')
    assert resolved_configuration()[1]['judge']['origin'] == 'global'
    monkeypatch.setenv('EVAL_WRITER_INPUT_USD_PER_MILLION', '0.1')
    with pytest.raises(ValueError, match='Both rate'):
        resolved_configuration()
    monkeypatch.setenv('EVAL_WRITER_OUTPUT_USD_PER_MILLION', '0.5')
    rates = resolved_configuration()[1]
    assert rates['writer'] == {'input': .1, 'output': .5, 'origin': 'explicit'}
    assert rates['patient']['input'] == 2


def test_shared_role_budget_wrapper_propagation_and_usage():
    from evals.runner import BudgetExceeded
    ledger = Ledger(limit=.025, role_rates={'writer': {'input': 2, 'output': 10},
                                          'judge': {'input': .1, 'output': .5}})
    writer = MeteredModel(FakeModel('writer'), ledger, role='writer', model_id='sol')
    structured = writer.with_structured_output(type('ExtractionOutput', (), {}))
    assert structured.ledger is ledger and structured.model_id == 'sol' and structured.role == 'writer'
    # Keep an outstanding reservation; the next role must honor that same budget.
    bound = ledger.reserve(['first'], 1024, 'writer')
    with pytest.raises(BudgetExceeded):
        ledger.reserve(['second'], 1024, 'writer')
    ledger.record(AIMessage(content='ok', usage_metadata={'input_tokens': 100, 'output_tokens': 20,
                   'total_tokens': 120, 'output_token_details': {'reasoning': 10}}), bound, 1024, 'writer')
    assert ledger.output_tokens == 20
    assert ledger.cost == pytest.approx(.0004)
    bound = ledger.reserve(['judge'], 1024, 'judge')
    ledger.record(None, bound, 1024, 'judge')
    assert ledger.cost == pytest.approx(sum(r['cost'] for r in ledger.roles.values()))
    assert ledger.pending_cost == pytest.approx(0)
    assert ledger.roles['judge']['estimated_output_tokens'] == 1024


@pytest.mark.parametrize('exception', [TimeoutError(), ValueError('provider failure'), asyncio.CancelledError()])
def test_failed_calls_charged_once_with_role(exception):
    class Failure:
        async def ainvoke(self, messages):
            raise exception
    ledger = Ledger()
    with pytest.raises(type(exception)):
        asyncio.run(MeteredModel(Failure(), ledger, role='writer', model_id='luna').ainvoke(['test']))
    stats = ledger.roles['writer']
    assert stats['calls'] == stats['errors'] == 1
    assert stats['estimated_output_tokens'] == 1024 and stats['measured_output_tokens'] == 0
    assert ledger.cost == stats['cost'] and ledger.pending_cost == 0


def test_bind_tools_preserves_role_and_model():
    ledger = Ledger()
    class Binding:
        def bind_tools(self, tools):
            return self
    bound = MeteredModel(Binding(), ledger, role='writer', model_id='sol').bind_tools([])
    assert bound.role == 'writer' and bound.model_id == 'sol' and bound.ledger is ledger


def test_agent_timing_excludes_patient_and_judge_includes_errors(monkeypatch):
    deny_network(monkeypatch)
    from evals.runner import AgentHarness
    clock = [0.0]
    monkeypatch.setattr('evals.runner.time.monotonic', lambda: clock[0])
    class TimedJudge(FakeModel):
        async def ainvoke(self, messages):
            clock[0] += 50
            return await super().ainvoke(messages)
    class TimedPatient(FakeModel):
        async def ainvoke(self, messages):
            clock[0] += 100
            return AIMessage(content='What is included?')
    async def reply(self, scenario, patient):
        clock[0] += 2
        if patient == 'What is included?':
            raise TimeoutError()
        return 'Implants cost EUR 650–950.', []
    monkeypatch.setattr(AgentHarness, 'reply', reply)
    ledger = Ledger(limit=100)
    models = fake_models(ledger)
    models['judge'] = TimedJudge('judge')
    models['patient'] = TimedPatient('patient')
    results = asyncio.run(evaluate(load_scenarios(ROOT / 'scenarios.json')[:1], FACTS, models, ledger, agent='v2'))
    assert [t['seconds'] for t in results[0]['agent_turns']] == [2, 2]
    assert results[0]['agent_turns'][1]['error'] and results[0]['agent_turns'][1]['timeout']
    assert not results[0]['passed']


def test_provider_error_stops_run_and_truncation_is_visible(monkeypatch):
    deny_network(monkeypatch)
    ledger = Ledger(limit=100)
    class Failure(FakeModel):
        async def ainvoke(self, messages):
            raise ValueError('Unsupported parameter')
    models = fake_models(ledger)
    models['writer'] = MeteredModel(Failure('writer'), ledger, role='writer', model_id='fake-writer')
    results = asyncio.run(evaluate(load_scenarios(ROOT / 'scenarios.json')[:2], FACTS, models, ledger, agent='v2'))
    assert len(results) == 1 and not results[0]['passed']
    assert results[0]['agent_turns'][0]['error']
    bound = ledger.reserve([], 1024, 'judge')
    ledger.record(AIMessage(content='partial', response_metadata={'finish_reason': 'length'}), bound, 1024, 'judge')
    assert ledger.roles['judge']['truncations'] == 1


def comparison_document(monkeypatch, candidate=False):
    from evals.run import resolved_configuration
    from evals.reporting import manifest, aggregate, SOURCE_FILES
    configure_eval(monkeypatch, 'gpt-6-sol' if candidate else 'gpt-6-luna')
    if candidate:
        monkeypatch.setenv('FLAGSHIP_TEMPERATURE', '')
    for role in ('writer', 'extractor', 'checker', 'patient', 'judge'):
        for kind, rate in [('INPUT', '2' if candidate and role == 'writer' else '.1'),
                           ('OUTPUT', '10' if candidate and role == 'writer' else '.5')]:
            monkeypatch.setenv(f'EVAL_{role.upper()}_{kind}_USD_PER_MILLION', rate)
    models, rates, limits = resolved_configuration()
    scenarios = load_scenarios(ROOT / 'scenarios.json')
    m = manifest('test-sol' if candidate else 'test-luna', 'v2', scenarios, models, rates,
                 {**limits, 'budget_usd': 2.25})
    m['source'] = {'revision': 'a' * 40, 'hashes': {name: 'b' * 64 for name in SOURCE_FILES},
                   'established': True, 'tracked_worktree_dirty': False, 'selection_eligible': True}
    ledger = Ledger(limit=2.25, role_rates=rates)
    for role, config in models.items():
        ledger.totals(role, config['model'])
    results = []
    for s in scenarios:
        actions = [{'type': 'HANDOFF_TO_HUMAN', 'payload': {'reason': 'Synthetic test'}}] if s['expect_handoff'] else []
        results.append({'id': s['id'], 'passed': True, 'complete': True, 'handoff': True, 'error': None,
                        'score': 4, 'provider_errors': [], 'actions': actions,
                        'agent_turns': [{'seconds': 2., 'error': False, 'timeout': False, 'writer_calls': 0}],
                        'turns': [{'patient': 'Synthetic', 'reply': 'Synthetic', 'actions': actions,
                                   'checks': {'grounded_price': True}, 'judge': {'score': 4, 'reason': 'Synthetic verdict',
                                   'must_do_met': True, 'must_not_do_met': True}}]})
    accounting = ledger.accounting()
    return {'schema_version': 1, 'manifest': m, 'results': results,
            'aggregate': aggregate(results, m['selected'], accounting), 'accounting': accounting}


def test_complete_json_and_comparable_report(monkeypatch, tmp_path):
    deny_network(monkeypatch)
    from evals.compare import compare, load_report
    left, right = comparison_document(monkeypatch), comparison_document(monkeypatch, True)
    lp, rp = tmp_path / 'luna.json', tmp_path / 'sol.json'
    lp.write_text(json.dumps(left))
    rp.write_text(json.dumps(right))
    path, eligible = compare(load_report(lp), load_report(rp), lp, rp, tmp_path)
    report = path.read_text()
    assert eligible and 'COMPARABLE exploratory pair' in report
    assert '55/55 (100.0%)' in report and '28/28 (100.0%)' in report
    assert 'Both pass' in report and 'Manual safety review' in report
    assert 'No selection' in report and 'cached input at ordinary input rate' in report
    # The JSON is the complete transcript source even when Markdown retains only ten.
    assert lp.as_uri() in report


@pytest.mark.parametrize('change,fragment', [
    ('revision', 'Source revision mismatch'), ('hashes', 'Source hashes mismatch'),
    ('dirty', 'tracked worktree dirty'), ('fixed', 'Fixed role model/options mismatch'),
    ('selected', 'selected mismatch'), ('limits', 'limits mismatch'),
    ('incomplete', 'incomplete/error/budget-stopped'), ('truncation', 'output truncation'),
    ('unexpected', 'unexpected v2 extractor calls'), ('timeout', 'error/timeout'),
])
def test_comparison_incompatible_or_incomplete_cannot_win(monkeypatch, tmp_path, change, fragment):
    from evals.compare import compare, validate
    left, right = comparison_document(monkeypatch), comparison_document(monkeypatch, True)
    if change == 'revision':
        right['manifest']['source']['revision'] = 'c' * 40
    elif change == 'hashes':
        right['manifest']['source']['hashes']['evals/scenarios.json'] = 'c' * 64
    elif change == 'dirty':
        right['manifest']['source']['tracked_worktree_dirty'] = True
    elif change == 'fixed':
        right['manifest']['models']['patient']['temperature'] = .9
    elif change == 'selected':
        right['manifest']['selected'][0]['language'] = 'ar'
    elif change == 'limits':
        right['manifest']['limits']['model_timeout_seconds'] = 19
    elif change == 'incomplete':
        right['results'] = right['results'][:3]
    elif change == 'truncation':
        right['accounting']['roles']['writer']['truncations'] = 1
    elif change == 'unexpected':
        right['accounting']['roles']['extractor']['calls'] = 1
    elif change == 'timeout':
        right['results'][0]['agent_turns'][0]['timeout'] = True
    path, eligible = compare(validate(left), validate(right), tmp_path / 'l.json', tmp_path / 'r.json', tmp_path)
    assert not eligible and '**INCONCLUSIVE' in path.read_text() and fragment in path.read_text()


def test_fixed_rate_changes_and_illustrative_rates_invalidate_cost(monkeypatch, tmp_path):
    from evals.compare import compare, validate
    left, right = comparison_document(monkeypatch), comparison_document(monkeypatch, True)
    right['manifest']['rates']['judge']['input'] = .2
    left['manifest']['rates']['patient']['origin'] = 'illustrative'
    path, _ = compare(validate(left), validate(right), tmp_path / 'l.json', tmp_path / 'r.json', tmp_path)
    report = path.read_text()
    assert '**Cost comparison: INVALID**' in report
    assert 'Fixed role rates changed: judge' in report and 'illustrative rates' in report


@pytest.mark.parametrize('bad', ['schema', 'duplicate', 'missing', 'negative', 'pass-error', 'duplicate-key'])
def test_malformed_comparison_input_rejected(monkeypatch, tmp_path, bad):
    from evals.compare import load_report
    doc = comparison_document(monkeypatch)
    if bad == 'schema':
        doc['schema_version'] = 42
    elif bad == 'duplicate':
        doc['results'].append(doc['results'][0])
    elif bad == 'missing':
        del doc['manifest']['models']['judge']
    elif bad == 'negative':
        doc['results'][0]['agent_turns'][0]['seconds'] = -1
    elif bad == 'pass-error':
        doc['results'][0]['error'] = 'TimeoutError'
    path = tmp_path / 'bad.json'
    path.write_text('{"schema_version": 1, "schema_version": 1}' if bad == 'duplicate-key' else json.dumps(doc))
    with pytest.raises(ValueError, match='Invalid report'):
        load_report(path)


def test_language_denominators_handoffs_and_nearest_rank_latency(monkeypatch):
    from evals.reporting import aggregate
    doc = comparison_document(monkeypatch)
    selected = doc['manifest']['selected']
    # One required handoff missed; one unnecessary handoff with expectation-match boolean true.
    required = next(i for i, s in enumerate(selected) if s['expect_handoff'])
    doc['results'][required]['actions'] = []
    doc['results'][required]['passed'] = False
    doc['results'][0]['actions'] = [{'type': 'HANDOFF_TO_HUMAN', 'payload': {}}]
    rows = doc['results'][:required + 1]
    for i, row in enumerate(rows):
        row['agent_turns'][0]['seconds'] = i + 1
    totals = aggregate(rows, selected, doc['accounting'])
    assert totals['selected'] == 55 and totals['attempted'] == len(rows)
    assert totals['passed'] == len(rows) - 1 and totals['unrun'] == 55 - len(rows)
    assert totals['pass_rate'] == (len(rows) - 1) / 55
    assert totals['legacy_pass_rate'] == (len(rows) - 1) / len(rows)
    assert totals['languages']['tr']['selected'] == 15 and totals['languages']['tr']['passed'] == 0
    assert totals['handoffs']['unnecessary'] == 1 and totals['handoffs']['missed'] == 1
    assert totals['handoffs']['actual'] == 1
    assert totals['latency']['p95_seconds'] == len(rows)
    assert aggregate([], selected)['latency']['median_seconds'] is None


def test_sol_numeric_heuristic_never_activates_model(monkeypatch, tmp_path):
    from evals.compare import compare, validate
    left, right = comparison_document(monkeypatch), comparison_document(monkeypatch, True)
    for result in left['results'][:3]:
        result['passed'] = False
        result['turns'][0]['checks']['grounded_price'] = False
        result['turns'][0]['judge']['reason'] = 'Unverified price requires manual review'
    path, eligible = compare(validate(left), validate(right), tmp_path / 'l.json', tmp_path / 'r.json', tmp_path)
    report = path.read_text()
    assert eligible and 'Sol gain: +3/55' in report and 'Sol meets the numeric review heuristic' in report
    assert 'No selection until manual review' in report and 'hard checks: grounded_price' in report


def test_compare_imports_no_app_or_sdk(monkeypatch):
    import builtins
    import importlib
    import evals.compare
    original = builtins.__import__
    def guard(name, *args, **kwargs):
        if name.startswith(('app.', 'openai', 'langchain')):
            pytest.fail('Comparison imported application/API code')
        return original(name, *args, **kwargs)
    monkeypatch.setattr(builtins, '__import__', guard)
    importlib.reload(evals.compare)


def test_compare_cli_usage_and_inconclusive_exit(monkeypatch, tmp_path, capsys):
    deny_network(monkeypatch)
    import evals.compare as comparison
    doc = comparison_document(monkeypatch)
    doc['results'] = doc['results'][:1]
    lp, rp = tmp_path / 'l.json', tmp_path / 'r.json'
    lp.write_text(json.dumps(doc))
    rp.write_text(json.dumps(doc))
    original = comparison.compare
    monkeypatch.setattr(comparison, 'compare', lambda l, r, a, b: original(l, r, a, b, tmp_path))
    assert comparison.main(['--left', str(lp), '--right', str(rp)]) == 1
    assert 'INCONCLUSIVE' in capsys.readouterr().out
    lp.write_text('not JSON')
    with pytest.raises(SystemExit) as exc:
        comparison.main(['--left', str(lp), '--right', str(rp)])
    assert exc.value.code == 2


def test_deadline_handoff_timing_and_legacy_match_boolean(monkeypatch):
    deny_network(monkeypatch)
    from evals.runner import AgentHarness
    from evals.reporting import aggregate
    async def reply(self, scenario, patient):
        return 'The clinic team will help.', [{'type': 'HANDOFF_TO_HUMAN', 'payload': {'reason': 'turn_deadline_exceeded'}}]
    monkeypatch.setattr(AgentHarness, 'reply', reply)
    scenarios = load_scenarios(ROOT / 'scenarios.json')[:2]
    ledger = Ledger(limit=100)
    results = asyncio.run(evaluate(scenarios, FACTS, fake_models(ledger), ledger, agent='v2'))
    totals = aggregate(results, scenarios, ledger.accounting())
    assert len(results) == 1 and not results[0]['complete'] and not results[0]['passed']
    assert totals['latency']['timeouts'] == totals['latency']['errors'] == 1
    assert totals['judge_replies'] == 0 and totals['handoffs']['actual'] == 1
    assert totals['handoffs']['unnecessary'] == 1 and totals['latency']['zero_writer_call_turns'] == 1



def test_emitted_cli_json_validates_with_resolved_manifest(monkeypatch, tmp_path):
    deny_network(monkeypatch)
    configure_eval(monkeypatch)
    from evals.compare import load_report
    monkeypatch.setattr('evals.run.make_models', fake_models)
    monkeypatch.setattr('evals.run.write_report', lambda r, s, l: write_report(r, s, l, tmp_path))
    assert main(['--agent', 'v2', '--label', 'actual-fake-run', '--only', 'en-implant-price']) == 0
    doc = load_report(next(tmp_path.glob('*.json')))
    assert doc['manifest']['label'] == 'actual-fake-run'
    assert doc['accounting']['roles']['writer']['calls'] == doc['aggregate']['latency']['writer_calls']
    assert doc['aggregate']['judge_replies'] == len(doc['results'][0]['turns'])
    assert doc['accounting']['roles']['extractor']['calls'] == doc['accounting']['roles']['checker']['calls'] == 0
