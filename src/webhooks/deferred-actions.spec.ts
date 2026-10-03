import { splitAfterSendActions } from './deferred-actions';

describe('splitAfterSendActions', () => {
  const action = (type: string) => ({ type, payload: '{}' });

  it('defers a handoff and drops a duplicate NOTIFY_AGENT', () => {
    const { immediate, afterSend } = splitAfterSendActions([
      action('UPDATE_SUMMARY'),
      action('NOTIFY_AGENT'),
      action('HANDOFF_TO_HUMAN'),
      action('PAUSE_CONVERSATION'),
    ]);
    expect(afterSend).toBe('HANDOFF_TO_HUMAN');
    expect(immediate.map((item) => item.type)).toEqual(['UPDATE_SUMMARY']);
  });

  it('defers a pause and keeps NOTIFY_AGENT without a handoff', () => {
    const { immediate, afterSend } = splitAfterSendActions([
      action('NOTIFY_AGENT'),
      action('PAUSE_CONVERSATION'),
    ]);
    expect(afterSend).toBe('PAUSE_CONVERSATION');
    expect(immediate.map((item) => item.type)).toEqual(['NOTIFY_AGENT']);
  });

  it('runs everything immediately when nothing pauses the AI', () => {
    expect(splitAfterSendActions(undefined)).toEqual({
      immediate: [],
      afterSend: null,
    });
  });
});
