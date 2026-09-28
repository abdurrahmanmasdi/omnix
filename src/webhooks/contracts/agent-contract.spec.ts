import fixtures from './agent-actions.v1.fixtures.json';
import { AGENT_CONTRACT_VERSION, isCompatibleAgentVersion, parseAgentAction } from './agent-contract';

describe('agent action contract v1', () => {
  it('accepts all golden actions', () => {
    expect(AGENT_CONTRACT_VERSION).toBe(1);
    for (const item of fixtures.valid) {
      expect(parseAgentAction({ type: item.type, payload: JSON.stringify(item.payload) })).toMatchObject(item);
    }
  });

  it('rejects missing, extra, invalid enum/date and forged fields', () => {
    for (const item of fixtures.invalid) {
      expect(parseAgentAction({ type: item.type, payload: JSON.stringify(item.payload) })).toBeNull();
    }
    expect(parseAgentAction({ type: 'UPDATE_LEAD', payload: '{bad' })).toBeNull();
  });

  it('allows a legacy rolling peer but refuses an incompatible version', () => {
    expect(isCompatibleAgentVersion(0)).toBe(true);
    expect(isCompatibleAgentVersion(1)).toBe(true);
    expect(isCompatibleAgentVersion(2)).toBe(false);
  });
});
