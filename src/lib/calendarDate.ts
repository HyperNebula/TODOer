import { Temporal } from "@js-temporal/polyfill";
import type { Timeblock } from "../types/task";

export const systemTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
export const hasOffset = (value: string) => /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
const validZones = new Map<string, string>();

export function validateTimeZone(zone: string): string {
  const cached = validZones.get(zone);
  if (cached) return cached;
  try {
    const resolved = new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone;
    validZones.set(zone, resolved);
    return resolved;
  } catch {
    throw new Error("Enter a valid IANA time zone, such as America/Denver or Europe/London.");
  }
}

export function normalizeIso(iso?: string | null): string {
  if (!iso) return "";
  return iso.length === 16 && iso[10] === "T" ? iso + ":00" : iso;
}

/** Pseudo-UTC values are used only for timezone-free recurrence arithmetic. */
export function parseWallClockUtc(value: string): Date {
  const wall = Temporal.PlainDateTime.from(value.includes("T") ? value : value + "T00:00:00");
  return new Date(wall.toZonedDateTime("UTC").epochMilliseconds);
}

export function formatWallClockUtc(date: Date): string {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO("UTC")
    .toPlainDateTime().toString();
}

export function addDays(date: string, days: number): string {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}

export function daysBetween(start: string, end: string): number {
  return Temporal.PlainDate.from(start).until(Temporal.PlainDate.from(end)).days;
}

export function dateAtMinutes(date: string, minutes: number): string {
  return Temporal.PlainDate.from(date).toPlainDateTime().add({ minutes })
    .toString({ smallestUnit: "second" });
}

export function wallInZone(value: string, zone: string): string {
  if (!hasOffset(value)) return normalizeIso(value);
  return Temporal.Instant.from(value).toZonedDateTimeISO(zone).toPlainDateTime()
    .toString();
}

/** Preserve the later fall-back occurrence when an existing event is unchanged. */
export function wallToTimestamp(value: string, zone: string, previous?: string): string {
  validateTimeZone(zone);
  const wall = Temporal.PlainDateTime.from(value);
  if (previous && hasOffset(previous) && wallInZone(previous, zone) === wall.toString()) {
    return timestampInZone(Temporal.Instant.from(previous).epochMilliseconds, zone);
  }
  // A new ambiguous time uses the earlier offset. A nonexistent clock time is rejected.
  const zoned = wall.toZonedDateTime(zone, { disambiguation: "compatible" });
  if (!zoned.toPlainDateTime().equals(wall)) {
    throw new Error(`That clock time does not exist in ${zone} because the clocks move forward. Choose another time.`);
  }
  return zoned.toString({ timeZoneName: "never", calendarName: "never" });
}

export function timestampInZone(milliseconds: number, zone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(milliseconds).toZonedDateTimeISO(zone)
    .toString({ timeZoneName: "never", calendarName: "never" });
}

export function instantMs(value: string, floatingZone: string): number {
  return Temporal.Instant.from(hasOffset(value) ? value : wallToTimestamp(value, floatingZone)).epochMilliseconds;
}

export function todayInZone(zone: string): string {
  return Temporal.Now.instant().toZonedDateTimeISO(zone).toPlainDate().toString();
}

export function dayStartMs(date: string, zone: string): number {
  return Temporal.PlainDate.from(date).toZonedDateTime(zone).epochMilliseconds;
}

export function sameOccurrence(a: string | undefined, b: string, allDay: boolean, zone: string): boolean {
  if (!a) return false;
  if (allDay) return a === b;
  if (!hasOffset(a) && !hasOffset(b)) return normalizeIso(a) === normalizeIso(b);
  return instantMs(a, zone) === instantMs(b, zone);
}

export function normalizeSchedule(block: Timeblock, displayZone: string, preserveFloating = false): Timeblock {
  if (block.allDay) {
    const startTime = Temporal.PlainDate.from(block.startTime).toString();
    const endTime = Temporal.PlainDate.from(block.endTime).toString();
    if (startTime >= endTime) throw new Error("The end date must be after the start date.");
    return { ...block, startTime, endTime, allDay: true, timeZone: undefined };
  }
  const zone = validateTimeZone(block.timeZone || displayZone);
  if (preserveFloating && !block.timeZone && !hasOffset(block.startTime) && !hasOffset(block.endTime)) {
    const startTime = Temporal.PlainDateTime.from(block.startTime).toString();
    const endTime = Temporal.PlainDateTime.from(block.endTime).toString();
    if (startTime >= endTime) throw new Error("The end time must be after the start time.");
    return { ...block, startTime, endTime, allDay: false };
  }
  const startTime = hasOffset(block.startTime) ? timestampInZone(instantMs(block.startTime, zone), zone) : wallToTimestamp(block.startTime, zone);
  const endTime = hasOffset(block.endTime) ? timestampInZone(instantMs(block.endTime, zone), zone) : wallToTimestamp(block.endTime, zone);
  if (instantMs(startTime, zone) >= instantMs(endTime, zone)) throw new Error("The end time must be after the start time.");
  return { ...block, startTime, endTime, allDay: false, timeZone: zone };
}

export function overlapsRange(block: Timeblock, start: string, end: string, zone: string): boolean {
  if (block.isDeleted) return false;
  if (block.allDay) return block.startTime < end.slice(0, 10) && block.endTime > start.slice(0, 10);
  if (!block.timeZone && !hasOffset(block.startTime)) {
    return parseWallClockUtc(block.startTime) < parseWallClockUtc(wallInZone(end, zone))
      && parseWallClockUtc(block.endTime) > parseWallClockUtc(wallInZone(start, zone));
  }
  const eventZone = block.timeZone || zone;
  return instantMs(block.startTime, eventZone) < instantMs(end, zone)
    && instantMs(block.endTime, eventZone) > instantMs(start, zone);
}

export interface DaySegment {
  startMin: number;
  endMin: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** Project and clip an event to one display date and the visible grid hours. */
export function segmentForDate(block: Timeblock, date: string, zone: string, gridStart = 0, gridEnd = 1440): DaySegment | null {
  if (block.allDay || block.isDeleted) return null;
  if (!block.timeZone && !hasOffset(block.startTime)) {
    const origin = parseWallClockUtc(date).getTime();
    const rawStart = (parseWallClockUtc(block.startTime).getTime() - origin) / 60_000;
    const rawEnd = (parseWallClockUtc(block.endTime).getTime() - origin) / 60_000;
    const startMin = Math.max(gridStart, rawStart);
    const endMin = Math.min(gridEnd, rawEnd);
    return endMin <= startMin ? null : { startMin, endMin, continuesBefore: rawStart < gridStart, continuesAfter: rawEnd > gridEnd };
  }
  const eventZone = block.timeZone || zone;
  const start = instantMs(block.startTime, eventZone);
  const end = instantMs(block.endTime, eventZone);
  const dayStart = dayStartMs(date, zone);
  const dayEnd = dayStartMs(addDays(date, 1), zone);
  if (start >= dayEnd || end <= dayStart) return null;
  const minute = (ms: number) => {
    const wall = Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(zone);
    return wall.hour * 60 + wall.minute + wall.second / 60;
  };
  const rawStart = start < dayStart ? 0 : minute(start);
  const rawEnd = end >= dayEnd ? 1440 : minute(end);
  // Repeated fall-back hours share one clock column; keep a positive visible card.
  const visibleEnd = Math.max(rawEnd, rawStart + Math.min(15, (end - start) / 60_000));
  const startMin = Math.max(gridStart, rawStart);
  const endMin = Math.min(gridEnd, visibleEnd);
  if (endMin <= startMin) return null;
  return { startMin, endMin, continuesBefore: start < dayStart || rawStart < gridStart, continuesAfter: end > dayEnd || rawEnd > gridEnd };
}

export function moveTimedBlock(block: Timeblock, minutes: number, days: number, displayZone: string): Pick<Timeblock, "startTime" | "endTime"> {
  const legacy = !block.timeZone && !hasOffset(block.startTime);
  if (legacy) {
    const delta = (days * 1440 + minutes) * 60_000;
    return {
      startTime: formatWallClockUtc(new Date(parseWallClockUtc(block.startTime).getTime() + delta)),
      endTime: formatWallClockUtc(new Date(parseWallClockUtc(block.endTime).getTime() + delta)),
    };
  }
  const eventZone = block.timeZone || displayZone;
  const duration = instantMs(block.endTime, eventZone) - instantMs(block.startTime, eventZone);
  // Temporal duration fields must share a sign; day and time drags can oppose.
  const startWall = Temporal.PlainDateTime.from(wallInZone(block.startTime, displayZone))
    .add({ days }).add({ minutes });
  const start = instantMs(wallToTimestamp(startWall.toString(), displayZone), displayZone);
  return {
    startTime: timestampInZone(start, eventZone),
    endTime: timestampInZone(start + duration, eventZone),
  };
}
