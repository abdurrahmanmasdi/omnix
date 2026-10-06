"""Small, versioned playbook rules; malformed rules stop initialization."""
import json
from pathlib import Path


def load_guidelines(path=Path(__file__).with_name('guidelines.json')):
    rows = json.loads(path.read_text())
    ids = set()
    if not isinstance(rows, list) or not rows:
        raise ValueError('Guidelines must be a nonempty list')
    for row in rows:
        if (not isinstance(row, dict) or not {'id', 'when', 'do'} <= row.keys()
                or set(row) - {'id', 'when', 'do', 'never', 'example'}
                or any(not isinstance(v, str) or not v.strip() for v in row.values())
                or row['id'] in ids):
            raise ValueError('Invalid or duplicate guideline')
        ids.add(row['id'])
    return rows


GUIDELINES = load_guidelines()
