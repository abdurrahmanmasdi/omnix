import spec from './agent-actions.v1.json';
import type { ToolAction } from '../interfaces/agent.interface';

export const AGENT_CONTRACT_VERSION = spec.version;

export type LeadActionPayload = Partial<{
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  country: string;
  primaryLanguage: string;
  preferredLanguage: string;
  timezone: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
  currency: 'USD' | 'TRY' | 'EUR' | 'GBP';
  priority: 'HOT' | 'WARM' | 'COLD';
  status:
    | 'NEW'
    | 'QUALIFYING'
    | 'QUALIFIED'
    | 'READY_TO_BOOK'
    | 'READY_TO_PAY'
    | 'HANDED_OFF'
    | 'UNQUALIFIED'
    | 'WON'
    | 'LOST';
}>;

export type ParsedAgentAction =
  | { type: 'CREATE_LEAD' | 'UPDATE_LEAD'; payload: LeadActionPayload }
  | { type: 'UPDATE_SUMMARY'; payload: { summary: string } }
  | { type: 'HANDOFF_TO_HUMAN'; payload: { reason?: string } }
  | { type: 'PAUSE_CONVERSATION'; payload: Record<string, never> }
  | { type: 'NOTIFY_AGENT'; payload: { title?: string; body?: string } }
  | {
      type: 'SCHEDULE_FOLLOW_UP';
      payload: { scheduledAt: string; context?: string };
    };

type FieldRule = { kind: string; max?: number; values?: string[] };
type ActionRule = {
  required: string[];
  fields?: Record<string, FieldRule>;
  sameFieldsAs?: string;
  minFields?: number;
};
const actions = spec.actions as Record<string, ActionRule>;
const dateTime =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isCompatibleAgentVersion(version: unknown): boolean {
  // v0 is accepted for one rolling-deploy window; all actions still receive v1 validation.
  return (
    version === undefined || version === 0 || version === AGENT_CONTRACT_VERSION
  );
}

export function parseAgentAction(value: unknown): ParsedAgentAction | null {
  if (!value || typeof value !== 'object') return null;
  if (Object.keys(value).some((key) => key !== 'type' && key !== 'payload'))
    return null;
  const wire = value as Partial<ToolAction>;
  if (
    typeof wire.type !== 'string' ||
    !Object.hasOwn(actions, wire.type) ||
    typeof wire.payload !== 'string' ||
    wire.payload.length > 16_384
  )
    return null;
  let payload: unknown;
  try {
    payload = JSON.parse(wire.payload);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return null;
  const rule = actions[wire.type];
  const fields = rule.sameFieldsAs
    ? actions[rule.sameFieldsAs].fields
    : rule.fields;
  if (!fields) return null;
  const entries = Object.entries(payload);
  if (
    entries.length < (rule.minFields ?? 0) ||
    rule.required.some((field) => !Object.hasOwn(payload, field)) ||
    entries.some(([field]) => !Object.hasOwn(fields, field))
  )
    return null;
  for (const [field, item] of entries) {
    const fieldRule = fields[field];
    if (fieldRule.kind === 'string') {
      if (
        typeof item !== 'string' ||
        !item.trim() ||
        item.length > (fieldRule.max ?? 0)
      )
        return null;
    } else if (fieldRule.kind === 'enum') {
      if (typeof item !== 'string' || !fieldRule.values?.includes(item))
        return null;
    } else if (fieldRule.kind === 'date-time') {
      if (
        typeof item !== 'string' ||
        !dateTime.test(item) ||
        Number.isNaN(new Date(item).getTime())
      )
        return null;
      const [year, month, day, hour, minute, second] = item
        .slice(0, 19)
        .split(/[-T:]/)
        .map(Number);
      const calendar = new Date(Date.UTC(year, month - 1, day));
      if (
        calendar.getUTCFullYear() !== year ||
        calendar.getUTCMonth() !== month - 1 ||
        calendar.getUTCDate() !== day ||
        hour > 23 ||
        minute > 59 ||
        second > 59
      )
        return null;
      // A follow-up in the past would fire immediately (KI-052; mirrors Python).
      if (
        wire.type === 'SCHEDULE_FOLLOW_UP' &&
        new Date(item).getTime() <= Date.now()
      )
        return null;
    } else return null;
  }
  return { type: wire.type, payload } as ParsedAgentAction;
}
