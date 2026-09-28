"""Fail if the three adjacent service checkouts disagree on public contracts."""
from pathlib import Path
import sys
import shutil

workspace = Path(__file__).resolve().parents[2]
backend = workspace / 'backend-v2'
python = workspace / 'python-ai-service-v2'
frontend = workspace / 'frontend-v2'
pairs = [
    (backend / 'src/webhooks/contracts/agent-actions.v1.json', python / 'app/modules/agent/agent-actions.v1.json'),
    (backend / 'src/webhooks/contracts/agent-actions.v1.fixtures.json', python / 'tests/agent-actions.v1.fixtures.json'),
    (backend / 'src/proto/agent.proto', python / 'proto/agent.proto'),
    (backend / 'src/events/dto/socket-events.generated.ts', frontend / 'src/lib/contracts/socket-events.generated.ts'),
    (backend / 'src/events/dto/socket-events.v1.fixtures.json', frontend / 'src/lib/contracts/socket-events.v1.fixtures.json'),
]
errors = []
for left, right in pairs:
    if '--sync' in sys.argv:
        if not left.is_file():
            errors.append(f'missing source contract: {left}')
            continue
        right.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(left, right)
        continue
    if not left.is_file() or not right.is_file():
        errors.append(f'missing contract: {left if not left.is_file() else right}')
    elif left.read_bytes() != right.read_bytes():
        errors.append(f'contract drift: {left.relative_to(workspace)} != {right.relative_to(workspace)}')
if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)
print('Cross-repository agent and socket contracts match.' if '--sync' not in sys.argv else 'Peer contracts synchronized.')
