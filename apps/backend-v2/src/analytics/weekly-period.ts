import { BadRequestException } from '@nestjs/common';

export const DAY = 86_400_000;
const OFFSET = 3 * 3_600_000;
export function currentMonday(asOf: Date): number {
  const local = new Date(asOf.getTime() + OFFSET);
  return (
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
    ((local.getUTCDay() + 6) % 7) * DAY
  );
}
export const dateLabel = (ms: number) =>
  new Date(ms).toISOString().slice(0, 10);
export function weeklyPeriod(query: Record<string, unknown>, asOf: Date) {
  if (Object.keys(query).some((key) => key !== 'weekStart'))
    throw new BadRequestException('Unknown weekly report query field');
  const monday = currentMonday(asOf);
  const requested = query.weekStart;
  let localStart = monday - 7 * DAY;
  if (requested !== undefined) {
    if (typeof requested !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(requested))
      throw new BadRequestException('weekStart must be one Monday date');
    localStart = Date.parse(requested + 'T00:00:00Z');
    if (
      !Number.isFinite(localStart) ||
      dateLabel(localStart) !== requested ||
      new Date(localStart).getUTCDay() !== 1
    )
      throw new BadRequestException('weekStart must be a real Monday');
  }
  if (localStart > monday || localStart < monday - 52 * 7 * DAY)
    throw new BadRequestException(
      'weekStart is outside the supported 52-week range',
    );
  const start = new Date(localStart - OFFSET);
  const end = new Date(localStart + 7 * DAY - OFFSET);
  const cutoff = new Date(Math.min(end.getTime(), asOf.getTime()));
  return {
    start,
    end,
    cutoff,
    period: {
      weekStart: dateLabel(localStart),
      weekEnd: dateLabel(localStart + 7 * DAY),
      startUtc: start.toISOString(),
      endUtc: end.toISOString(),
      cutoffUtc: cutoff.toISOString(),
      timezone: 'Europe/Istanbul' as const,
      inProgress: localStart === monday,
    },
  };
}
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}
export function p90(values: number[]): number | null {
  return values.length
    ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.9) - 1]
    : null;
}
