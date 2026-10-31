import { RRule, rrulestr } from "rrule";
import type { Timeblock } from "../types/task";
import {
  addDays, daysBetween, formatWallClockUtc, hasOffset, instantMs, normalizeIso,
  overlapsRange, parseWallClockUtc, sameOccurrence, timestampInZone, wallInZone, wallToTimestamp,
} from "./calendarDate";

export function occurrenceEnd(parent: Timeblock, originalStart: string, displayZone: string): string {
  if (parent.allDay) return addDays(originalStart, daysBetween(parent.startTime, parent.endTime));
  if (!parent.timeZone && !hasOffset(parent.startTime)) {
    const duration = parseWallClockUtc(parent.endTime).getTime() - parseWallClockUtc(parent.startTime).getTime();
    return formatWallClockUtc(new Date(parseWallClockUtc(originalStart).getTime() + duration));
  }
  const zone = parent.timeZone || displayZone;
  const duration = instantMs(parent.endTime, zone) - instantMs(parent.startTime, zone);
  const end = timestampInZone(instantMs(originalStart, zone) + duration, zone);
  return end;
}

function recurrenceRule(parent: Timeblock, zone: string): RRule {
  const wall = parent.allDay ? parent.startTime + "T00:00:00" : wallInZone(parent.startTime, zone);
  const dtstart = parseWallClockUtc(wall);
  const rule = rrulestr(parent.recurrenceRule!, { dtstart });
  if (!(rule instanceof RRule)) throw new Error("This recurrence set is not supported by the local calendar editor.");
  const options = { ...rule.origOptions, dtstart };
  // Zoned RRULE UNTIL is an instant; rrule's timezone-free expansion needs its wall time.
  if (options.until && !parent.allDay && (parent.timeZone || hasOffset(parent.startTime))) {
    options.until = parseWallClockUtc(wallInZone(options.until.toISOString(), zone));
  }
  return new RRule(options);
}

export function truncateSeries(parent: Timeblock, originalStart: string, displayZone: string): string {
  const zone = parent.timeZone || displayZone;
  const wall = parent.allDay ? parent.startTime + "T00:00:00" : wallInZone(parent.startTime, zone);
  const rule = rrulestr(parent.recurrenceRule!, { dtstart: parseWallClockUtc(wall) });
  if (!(rule instanceof RRule)) throw new Error("This recurrence set cannot be split in TODOer.");
  const until = parent.allDay || (!parent.timeZone && !hasOffset(parent.startTime))
    ? parseWallClockUtc(originalStart) : new Date(instantMs(originalStart, zone));
  until.setUTCSeconds(until.getUTCSeconds() - 1);
  // UNTIL and COUNT must not coexist; the shortened original is bounded by UNTIL.
  return new RRule({ ...rule.origOptions, dtstart: parseWallClockUtc(wall), count: null, until }).toString();
}

export function expandTimeblocks(
  normal: Timeblock[], recurring: Timeblock[], start: string, end: string, displayZone: string,
): Timeblock[] {
  const exceptions = recurring.filter(block => block.recurrenceId);
  const hasException = (parent: Timeblock, occurrence: string) => exceptions.some(ex =>
    ex.recurrenceId === parent.id && sameOccurrence(ex.originalStart, occurrence, !!parent.allDay, parent.timeZone || displayZone));
  const result = normal.filter(block => !block.isDeleted && overlapsRange(block, start, end, displayZone)
    && (!block.recurrenceRule || !hasException(block, block.startTime)));

  for (const parent of recurring.filter(block => block.recurrenceRule && !block.isDeleted)) {
    const zone = parent.timeZone || displayZone;
    const legacy = !parent.timeZone && !hasOffset(parent.startTime);
    const duration = parent.allDay ? daysBetween(parent.startTime, parent.endTime) * 86_400_000
      : legacy ? parseWallClockUtc(parent.endTime).getTime() - parseWallClockUtc(parent.startTime).getTime()
      : instantMs(parent.endTime, zone) - instantMs(parent.startTime, zone);
    const rangeWall = (value: string) => parent.allDay ? value.slice(0, 10) + "T00:00:00"
      : wallInZone(timestampInZone(instantMs(value, displayZone), zone), zone);
    const rangeStart = parseWallClockUtc(rangeWall(start));
    // Include occurrences beginning before the range that continue into it.
    rangeStart.setTime(rangeStart.getTime() - duration - 86_400_000);
    const rangeEnd = parseWallClockUtc(rangeWall(end));
    let rule = recurrenceRule(parent, zone);
    const parentWall = parent.allDay ? parent.startTime + "T00:00:00" : wallInZone(parent.startTime, zone);
    const count = rule.origOptions.count;
    // Invalid local times do not consume COUNT (RFC 5545). Count valid starts from DTSTART.
    if (count) rule = new RRule({ ...rule.origOptions, count: null });
    let validStarts = 0;
    const occurrences = rule.between(count ? parseWallClockUtc(parentWall) : rangeStart, rangeEnd, true, date => {
      if (!count) return true;
      try {
        if (!parent.allDay) wallToTimestamp(formatWallClockUtc(date), zone, parent.startTime);
        return ++validStarts <= count;
      } catch (error) {
        if (error instanceof Error && error.message.includes("does not exist")) return true;
        throw error;
      }
    });
    for (const occurrence of occurrences) {
      const wall = formatWallClockUtc(occurrence);
      // Legacy weekly expansion previously snapped to Monday. Never invent an occurrence before DTSTART.
      if (wall < parentWall) continue;
      let originalStart: string;
      try {
        originalStart = parent.allDay ? wall.slice(0, 10) : legacy ? normalizeIso(wall) : wallToTimestamp(wall, zone, parent.startTime);
        if (sameOccurrence(parent.startTime, originalStart, !!parent.allDay, zone) || hasException(parent, originalStart)) continue;
        const block: Timeblock = {
          ...parent, id: `virtual_${parent.id}_${originalStart}`, startTime: originalStart,
          endTime: occurrenceEnd(parent, originalStart, displayZone), taskIds: [], completed: false,
        };
        if (overlapsRange(block, start, end, displayZone)) result.push(block);
      } catch (error) {
        // RFC 5545 occurrences at nonexistent local times are skipped, not shifted.
        if (!(error instanceof Error) || !error.message.includes("does not exist")) throw error;
      }
    }
  }
  return result;
}
