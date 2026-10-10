"""Allowlisted source identity and pure report calculations; no application imports."""
import hashlib
import math
import os
import re
import statistics
import subprocess
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP = ROOT.parent
SCHEMA_VERSION = 1
ROLES = ('writer', 'extractor', 'checker', 'patient', 'judge')
# Explicit source allowlist: never walk the repository, dotenv or report directories.
SOURCE_FILES = (
    'evals/scenarios.json', 'evals/demo_clinic.json', 'evals/run.py', 'evals/runner.py',
    'evals/checks.py', 'evals/reporting.py', 'evals/compare.py',
    'app/core/config.py', 'app/infrastructure/model_options.py', 'app/infrastructure/llm_factory.py',
    'app/infrastructure/database_service.py', 'app/grpc_services/agent_servicer.py',
    'app/modules/agent/nodes.py', 'app/modules/agent/tools.py', 'app/modules/agent/graph_builder.py', 'app/modules/agent/prompts.py',
    'app/modules/agent/edges.py', 'app/modules/agent/state.py',
    'app/modules/coordinator/coordinator.py', 'app/modules/coordinator/guidelines.py',
    'app/modules/coordinator/guidelines.json', 'app/modules/coordinator/patient_facts.py',
    'app/modules/safety/policy.py', 'app/modules/agent/actions.py', 'app/modules/agent/agent-actions.v1.json',
)


def safe_error(exc):
    body = getattr(exc, 'body', None)
    error = body.get('error', body) if isinstance(body, dict) else None
    message = error.get('message') if isinstance(error, dict) else None
    value = str(message or str(exc) or type(exc).__name__)
    for name, secret in os.environ.items():
        if any(word in name.upper() for word in ('KEY', 'TOKEN', 'SECRET', 'PASSWORD')) and secret:
            value = value.replace(secret, '[REDACTED]')
    value = re.sub(r'(?i)bearer\s+\S+|sk-[A-Za-z0-9_-]+', '[REDACTED]', value)
    return value[:2000]


def source_identity():
    revision, dirty, hashes = None, None, {}
    try:
        revision = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=APP, check=True,
                                  capture_output=True, text=True).stdout.strip()
        if len(revision) != 40 or any(c not in '0123456789abcdef' for c in revision):
            revision = None
        # Return only a flag; never expose unrelated filenames or diffs.
        dirty = bool(subprocess.run(['git', 'status', '--porcelain', '--untracked-files=no'],
                                    cwd=APP, check=True, capture_output=True, text=True).stdout)
        for name in SOURCE_FILES:
            hashes[name] = hashlib.sha256((APP / name).read_bytes()).hexdigest()
    except (OSError, subprocess.SubprocessError):
        pass
    established = revision is not None and dirty is not None and len(hashes) == len(SOURCE_FILES)
    return {'revision': revision, 'tracked_worktree_dirty': dirty, 'hashes': hashes,
            'established': established, 'selection_eligible': established and dirty is False}


def manifest(label, agent, scenarios, models, rates, limits):
    return {'version': SCHEMA_VERSION, 'run_id': uuid.uuid4().hex,
            'started_at': datetime.now(timezone.utc).isoformat(), 'label': label, 'agent': agent,
            'source': source_identity(),
            'selected': [{'id': s['id'], 'language': s['language'], 'expect_handoff': s['expect_handoff'],
                          'max_turns': s['max_turns']} for s in scenarios],
            'models': models, 'rates': rates, 'limits': limits,
            'compatibility': 'Account access, API parameters and installed SDK compatibility are untested by offline preflight.'}


def aggregate(results, selected, accounting=None):
    by_id = {r['id']: r for r in results}
    scores = [t['judge']['score'] for r in results for t in r['turns'] if t.get('judged', True)]
    passed = sum(r['passed'] for r in results)
    legacy = sum(r['error'] != 'budget_stop' for r in results)
    languages = {}
    for lang in ('en', 'tr', 'ar'):
        rows = [s for s in selected if s['language'] == lang]
        languages[lang] = {'selected': len(rows), 'attempted': sum(s['id'] in by_id for s in rows),
                           'passed': sum(bool(by_id.get(s['id'], {}).get('passed')) for s in rows)}
    failures = Counter(k for r in results for t in r['turns'] for k, ok in t['checks'].items() if not ok)
    handoffs = {'expected': 0, 'actual': 0, 'unnecessary': 0, 'missed': 0, 'unassessed': 0}
    for scenario in selected:
        expected = scenario['expect_handoff']
        handoffs['expected'] += expected
        result = by_id.get(scenario['id'])
        if result is None:
            handoffs['unassessed'] += 1
            continue
        actions = result.get('actions', [a for t in result['turns'] for a in t['actions']])
        actual = any(a['type'] == 'HANDOFF_TO_HUMAN' for a in actions)
        handoffs['actual'] += actual
        handoffs['unnecessary'] += actual and not expected
        handoffs['missed'] += expected and not actual
    samples = [t for r in results for t in r.get('agent_turns', [])]
    elapsed = sorted(t['seconds'] for t in samples)
    latency = {'samples': len(elapsed), 'median_seconds': statistics.median(elapsed) if elapsed else None,
               'p95_seconds': elapsed[math.ceil(.95 * len(elapsed)) - 1] if elapsed else None,
               'errors': sum(t['error'] for t in samples), 'timeouts': sum(t['timeout'] for t in samples),
               'writer_calls': sum(t['writer_calls'] for t in samples),
               'zero_writer_call_turns': sum(t['writer_calls'] == 0 for t in samples)}
    roles = (accounting or {}).get('roles', {})
    writer_cost = roles.get('writer', {}).get('cost', 0)
    return {'selected': len(selected), 'attempted': len(results),
            'completed': sum(r['complete'] for r in results), 'unrun': len(selected) - len(results),
            'passed': passed, 'pass_rate': passed / len(selected) if selected else None,
            'legacy_finished_attempts': legacy, 'legacy_pass_rate': passed / legacy if legacy else None,
            'judge_average': sum(scores) / len(scores) if scores else None, 'judge_replies': len(scores),
            'languages': languages, 'hard_check_failures': dict(failures), 'handoffs': handoffs,
            'latency': latency, 'provider_errors': sum(len(r.get('provider_errors', [])) for r in results),
            'provider_timeouts': sum(r['timeouts'] for r in roles.values()),
            'truncations': sum(r['truncations'] for r in roles.values()),
            'writer_cost_per_scenario': writer_cost / len(results) if results else None,
            'writer_cost_per_turn': writer_cost / len(samples) if samples else None}


def escaped(value):
    return str(value).replace('<', '&lt;').replace('>', '&gt;').replace('```', "'''")
