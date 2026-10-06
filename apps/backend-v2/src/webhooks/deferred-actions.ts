import { ToolActionWire } from './interfaces/agent.interface';

export type AfterSendAction = 'HANDOFF_TO_HUMAN' | 'PAUSE_CONVERSATION';

/**
 * HANDOFF_TO_HUMAN and PAUSE_CONVERSATION pause the AI and bump the
 * conversation version. Run before the reply is sent, they cancel the AI's
 * own handoff bubble, so the patient got no message at all. They run after
 * the bubbles instead. A handoff already alerts eligible staff, so a
 * NOTIFY_AGENT in the same batch is dropped (one alert per staff member).
 */
export function splitAfterSendActions(actions: ToolActionWire[] = []): {
  immediate: ToolActionWire[];
  afterSend: AfterSendAction | null;
} {
  const handoff = actions.some((action) => action.type === 'HANDOFF_TO_HUMAN');
  const pause = actions.some((action) => action.type === 'PAUSE_CONVERSATION');
  return {
    immediate: actions.filter(
      (action) =>
        action.type !== 'HANDOFF_TO_HUMAN' &&
        action.type !== 'PAUSE_CONVERSATION' &&
        !(handoff && action.type === 'NOTIFY_AGENT'),
    ),
    afterSend: handoff
      ? 'HANDOFF_TO_HUMAN'
      : pause
        ? 'PAUSE_CONVERSATION'
        : null,
  };
}
