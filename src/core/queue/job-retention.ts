/**
 * Failed BullMQ jobs are the operational dead-letter queue, but their data
 * can hold patient PII (an inbound webhook job carries the full Meta body,
 * including message text and phone number). Keep them long enough to
 * inspect and replay, then let Redis drop them (S7).
 */
export const FAILED_JOB_RETENTION = {
  age: 7 * 24 * 60 * 60, // seconds
  count: 1000,
} as const;
