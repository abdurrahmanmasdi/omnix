"""Usage: python -m evals.run [--agent v1|v2] [--only id,...] [--max-scenarios N] [--max-cost USD].

Set OPENAI_API_KEY, FLAGSHIP_MODEL, EXTRACTOR_MODEL, CHEAP_MODEL,
EVAL_PATIENT_MODEL, EVAL_JUDGE_MODEL in the shell, never a dotenv file.
EVAL_INPUT_USD_PER_MILLION / EVAL_OUTPUT_USD_PER_MILLION apply to ALL calls;
use the highest chosen model rates for a conservative estimate. Defaults 1/5
are illustrative, not a provider price quote. --max-cost defaults to USD 5.
"""
import argparse
import asyncio
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path

from .runner import Ledger, MeteredModel, evaluate

ROOT = Path(__file__).resolve().parent


def positive(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError('Must be finite and positive')
    return number


def positive_int(value):
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError('Must be positive')
    return number


def load_scenarios(path):
    rows = json.loads(path.read_text())
    required = {'id', 'language', 'persona', 'opening_message', 'hidden_goal', 'must_do', 'must_not_do', 'expect_handoff', 'max_turns'}
    ids = set()
    for row in rows:
        if not isinstance(row, dict) or not required <= row.keys():
            raise ValueError('Scenario missing required fields')
        if row['id'] in ids or row['language'] not in {'en', 'tr', 'ar'}:
            raise ValueError('Duplicate scenario ID or unsupported language')
        ids.add(row['id'])
        for k in ['id', 'persona', 'opening_message', 'hidden_goal']:
            if not isinstance(row[k], str) or not row[k].strip():
                raise ValueError('Scenario strings must be nonempty')
        for k in ['must_do', 'must_not_do']:
            if not isinstance(row[k], list) or not row[k] or any(not isinstance(v, str) or not v.strip() for v in row[k]):
                raise ValueError('Scenario obligations must be nonempty string lists')
        if type(row['expect_handoff']) is not bool or type(row['max_turns']) is not int or not 1 <= row['max_turns'] <= 8:
            raise ValueError('Invalid handoff flag or turn limit')
    return rows


def make_models(ledger):
    # Imports do not touch service Settings or .env.
    from langchain_openai import ChatOpenAI
    names = {'writer': 'FLAGSHIP_MODEL', 'extractor': 'EXTRACTOR_MODEL', 'checker': 'CHEAP_MODEL',
             'patient': 'EVAL_PATIENT_MODEL', 'judge': 'EVAL_JUDGE_MODEL'}
    missing = [name for name in ['OPENAI_API_KEY', *names.values()] if not os.environ.get(name)]
    if missing:
        raise ValueError('Missing environment variables: ' + ', '.join(missing))
    from app.infrastructure.model_options import model_options
    # Validate every role before constructing any client.
    options = {role: model_options(os.environ.get(name.removesuffix('_MODEL') + '_TEMPERATURE'),
                                  os.environ.get(name.removesuffix('_MODEL') + '_REASONING_EFFORT'))
               for role, name in names.items()}
    return {role: MeteredModel(ChatOpenAI(
        model=os.environ[name], api_key=os.environ['OPENAI_API_KEY'], timeout=20,
        max_retries=0, max_tokens=1024, **options[role]), ledger)
        for role, name in names.items()}



def escaped(text):
    return str(text).replace('<', '&lt;').replace('>', '&gt;').replace('```', "'''")


def write_report(results, scenarios, ledger, directory=ROOT / 'reports'):
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.md')
    complete = [r for r in results if r['error'] != 'budget_stop']
    passed = sum(r['passed'] for r in complete)
    scores = [t['judge']['score'] for r in results for t in r['turns']]
    avg = sum(scores) / len(scores) if scores else 0
    lines = ['# Synthetic coordinator evaluation', '',
             f'Agent: {results[0].get("agent", "injected harness") if results else "no results"}.',
             f'Selected: {len(scenarios)}; attempted: {len(results)}; completed: {len(complete)}; unrun: {len(scenarios) - len(results)}.',
             f'Pass rate (finished attempts, errors count as failures): {passed}/{len(complete)} ({100 * passed / len(complete) if complete else 0:.1f}%).',
             f'Average reply score: {avg:.2f}/5 ({len(scores)} judged replies).',
             f'Errors/incomplete: {sum(not r["complete"] for r in results)}; budget stopped: {ledger.stopped}.',
             f'Estimated token cost: ${ledger.cost:.4f}; limit: ${ledger.limit:.2f}.',
             f'Input tokens: {ledger.input_tokens}; output tokens: {ledger.output_tokens}; reservation estimates used: {ledger.estimated_usage}.',
             f'Assumed USD/million rates (all roles): input {ledger.input_rate}, output {ledger.output_rate}. Defaults are illustrative; set actual rates in shell.',
             'A pass requires every reply score ≥4, all hard checks and judge obligations, and expected handoff action by conversation end.',
             'Language, currency and identity checks are conservative heuristics; the judge checks contextual grounding and semantic questions.',
             'Knowledge is a full synthetic fact sheet, not production retrieval quality. Actions are recorded proposals; no backend execution.',
             'Budget reservations include failed calls and structured responses without exposed usage; provider billing may differ.', '',
             '## Model configuration', '']
    for key in ['FLAGSHIP_MODEL', 'EXTRACTOR_MODEL', 'CHEAP_MODEL', 'EVAL_PATIENT_MODEL', 'EVAL_JUDGE_MODEL']:
        lines.append(f'- {key}: {escaped(os.environ.get(key, "injected fake model"))}')
    lines += ['', '## Worst 10 transcripts', '']
    for result in sorted(results, key=lambda r: (r['passed'], r['score'], r['id']))[:10]:
        lines += [f'### {result["id"]}: {"PASS" if result["passed"] else "FAIL"}, {result["score"]:.2f}/5',
                  f'Complete: {result["complete"]}; expected handoff check: {result["handoff"]}; error: {result["error"]}.', '']
        for error in result.get('provider_errors', []):
            lines += [f'Provider error: {escaped(error)}', '']
        for turn in result['turns']:
            lines += [f'Patient: {escaped(turn["patient"])}', '', f'AI: {escaped(turn["reply"])}', '',
                      f'Actions: {escaped(json.dumps(turn["actions"], ensure_ascii=False))}',
                      f'Checks: {json.dumps(turn["checks"])}',
                      f'Judge: {escaped(json.dumps(turn["judge"], ensure_ascii=False))}', '']
    path.write_text('\n'.join(lines) + '\n')
    return path


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--agent', choices=['v1', 'v2'], default='v1')
    parser.add_argument('--only', help='Comma-separated scenario IDs')
    parser.add_argument('--max-scenarios', type=positive_int)
    parser.add_argument('--max-cost', type=positive, default=5.0)
    args = parser.parse_args(argv)
    try:
        scenarios = load_scenarios(ROOT / 'scenarios.json')
        if args.only:
            wanted = set(args.only.split(','))
            unknown = wanted - {s['id'] for s in scenarios}
            if unknown:
                raise ValueError('Unknown IDs: ' + ', '.join(sorted(unknown)))
            scenarios = [s for s in scenarios if s['id'] in wanted]
        if args.max_scenarios:
            scenarios = scenarios[:args.max_scenarios]
        ledger = Ledger(args.max_cost, positive(os.environ.get('EVAL_INPUT_USD_PER_MILLION', '1')),
                        positive(os.environ.get('EVAL_OUTPUT_USD_PER_MILLION', '5')))
        facts = json.loads((ROOT / 'demo_clinic.json').read_text())
        models = make_models(ledger)
    except (ValueError, OSError, argparse.ArgumentTypeError) as exc:
        parser.error(str(exc))
    results = asyncio.run(evaluate(scenarios, facts, models, ledger, agent=args.agent))
    for result in results:
        result['agent'] = args.agent
    path = write_report(results, scenarios, ledger)
    print(f'Report: {path}; estimated cost ${ledger.cost:.4f}')
    return 0 if len(results) == len(scenarios) and all(r['passed'] for r in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
