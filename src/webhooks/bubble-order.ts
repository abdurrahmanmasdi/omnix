/**
 * Bubbles of one batch are created with a single createMany and share a
 * createdAt, so the database order is arbitrary (KI-078). The sequence is the
 * `-bubble-<n>` suffix of the idempotency key: the disclosure is always 0 and
 * goes first, and a reply is never sent before a pending disclosure.
 */
export function inBubbleOrder<T extends { idempotencyKey: string | null }>(
  bubbles: T[],
): T[] {
  const index = (bubble: T) =>
    Number(
      /-bubble-(\d+)$/.exec(bubble.idempotencyKey ?? '')?.[1] ??
        Number.MAX_SAFE_INTEGER,
    );
  return [...bubbles].sort((a, b) => index(a) - index(b));
}
