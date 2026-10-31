import { RRule, RRuleSet, rrulestr } from "rrule";
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

export function canEditRecurrence(value?: string | null): boolean {
  if (!value) return true;
  const lines=value.split(/\r?\n/).filter(line=>!line.startsWith("DTSTART"));
  if(lines.length!==1 || !lines[0].startsWith("RRULE:")) return false;
  return lines[0].slice(6).split(";").every(part=>{
    const [key,content]=part.split("=");
    return ["FREQ","INTERVAL","COUNT","UNTIL","WKST"].includes(key) || (key==="BYDAY" && !/[0-9+-]/.test(content));
  });
}

function recurrenceRule(parent: Timeblock, zone: string): RRule | RRuleSet {
  const wall = parent.allDay ? parent.startTime + "T00:00:00" : wallInZone(parent.startTime, zone);
  const dtstart = parseWallClockUtc(wall);
  const compact=(value:string)=>value.replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines=parent.recurrenceRule!.split(/\r?\n/).filter(line=>!line.startsWith("DTSTART")).map(line=>{
    if(!/^(EXDATE|RDATE)/.test(line)) return line;
    const separator=line.indexOf(":");
    const prefix=line.slice(0,separator);const sourceZone=prefix.match(/TZID=([^;:]+)/)?.[1] || zone;
    const values=line.slice(separator+1).split(",").map(value=>{
      const match=value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
      if(!match) throw new Error("This recurrence contains an invalid date.");
      const date=`${match[1]}-${match[2]}-${match[3]}`;
      let local=`${date}T${match[4] || "00"}:${match[5] || "00"}:${match[6] || "00"}`;
      if(!parent.allDay && (match[7] || sourceZone!==zone)) {
        const instant=match[7] ? local+"Z" : wallToTimestamp(local,sourceZone);
        local=wallInZone(instant,zone);
      }
      return compact(local)+"Z";
    });
    return prefix.split(";")[0]+":"+values.join(",");
  });
  const parsed=rrulestr(lines.join("\n"), {dtstart});
  const normalize=(rule:RRule)=>{
    const options={...rule.origOptions,dtstart};
    if(options.until && !parent.allDay && (parent.timeZone || hasOffset(parent.startTime))) {
      options.until=parseWallClockUtc(wallInZone(options.until.toISOString(),zone));
    }
    return new RRule(options);
  };
  if(!(parsed instanceof RRuleSet)) return normalize(parsed);
  const set=new RRuleSet();
  parsed.rrules().forEach(rule=>set.rrule(normalize(rule)));
  parsed.exrules().forEach(rule=>set.exrule(normalize(rule)));
  parsed.rdates().forEach(date=>set.rdate(date));parsed.exdates().forEach(date=>set.exdate(date));
  return set;
}

export function truncateSeries(parent: Timeblock, originalStart: string, displayZone: string): string {
  const zone = parent.timeZone || displayZone;
  const wall = parent.allDay ? parent.startTime + "T00:00:00" : wallInZone(parent.startTime, zone);
  const rule = rrulestr(parent.recurrenceRule!, { dtstart: parseWallClockUtc(wall) });
  if (rule instanceof RRuleSet) throw new Error("This recurrence set cannot be split in TODOer.");
  const until = parent.allDay || (!parent.timeZone && !hasOffset(parent.startTime))
    ? parseWallClockUtc(originalStart) : new Date(instantMs(originalStart, zone));
  until.setUTCSeconds(until.getUTCSeconds() - 1);
  // UNTIL and COUNT must not coexist; the shortened original is bounded by UNTIL.
  return new RRule({ ...rule.origOptions, dtstart: parseWallClockUtc(wall), count: null, until }).toString();
}

export function followingRule(parent: Timeblock, originalStart: string, requested: string | null | undefined, displayZone: string): string | null | undefined {
  const value=requested === undefined ? parent.recurrenceRule : requested;
  if(!value) return value;
  const zone=parent.timeZone || displayZone;
  const original=recurrenceRule(parent,zone);
  const next=rrulestr(value);
  if(original instanceof RRuleSet || next instanceof RRuleSet) throw new Error("Edit this recurrence set in Google Calendar.");
  const options={...next.origOptions,dtstart:undefined};
  if(original.origOptions.count && options.count===original.origOptions.count) {
    const start=parent.allDay ? parent.startTime : wallInZone(parent.startTime,zone);
    const cutoff=parent.allDay ? originalStart : wallInZone(originalStart,zone);
    const before=new RRule({...original.origOptions,count:null}).between(parseWallClockUtc(start),parseWallClockUtc(cutoff),true)
      .filter(date=>date<parseWallClockUtc(cutoff)).filter(date=>{
        if(parent.allDay || (!parent.timeZone && !hasOffset(parent.startTime))) return true;
        try {wallToTimestamp(formatWallClockUtc(date),zone);return true;}catch{return false;}
      }).length;
    options.count=Math.max(1,original.origOptions.count-before);
  }
  return new RRule(options).toString();
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
    const count = !(rule instanceof RRuleSet) ? rule.origOptions.count : null;
    // Invalid local times do not consume COUNT (RFC 5545). Count valid starts from DTSTART.
    if (count && !(rule instanceof RRuleSet)) rule = new RRule({ ...rule.origOptions, count: null });
    let validStarts = 0;
    const occurrences = rule.between(count ? parseWallClockUtc(parentWall) : rangeStart, rangeEnd, true, date => {
      if (!count) return true;
      try {
        if (!parent.allDay && !legacy) wallToTimestamp(formatWallClockUtc(date), zone, parent.startTime);
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
