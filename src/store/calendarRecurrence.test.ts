import { describe, expect, it } from "vitest";
import { normalizeIso, parseWallClockUtc, formatWallClockUtc } from "./calendarStore";
import { rrulestr } from "rrule";
import { expandTimeblocks, truncateSeries } from "../lib/calendarRecurrence";
import type { Timeblock } from "../types/task";

describe("calendar recurrence & wall-clock utilities", () => {
  describe("normalizeIso", () => {
    it("appends :00 to ISO datetime missing seconds", () => {
      expect(normalizeIso("2026-10-30T09:00")).toBe("2026-10-30T09:00:00");
      expect(normalizeIso("2026-10-30T19:30")).toBe("2026-10-30T19:30:00");
    });

    it("leaves already-complete ISO datetimes unchanged", () => {
      expect(normalizeIso("2026-10-30T09:00:00")).toBe("2026-10-30T09:00:00");
    });

    it("returns empty string or original for invalid/null", () => {
      expect(normalizeIso(null)).toBe("");
      expect(normalizeIso(undefined)).toBe("");
      expect(normalizeIso("2026-10-30")).toBe("2026-10-30");
    });
  });

  describe("parseWallClockUtc and formatWallClockUtc", () => {
    it("parses local wall-clock numbers directly into UTC coordinates", () => {
      const d = parseWallClockUtc("2026-10-27T19:30:00");
      expect(d.getUTCFullYear()).toBe(2026);
      expect(d.getUTCMonth()).toBe(9); // October
      expect(d.getUTCDate()).toBe(27);
      expect(d.getUTCHours()).toBe(19);
      expect(d.getUTCMinutes()).toBe(30);
      expect(d.getUTCSeconds()).toBe(0);
    });

    it("formats UTC coordinates back to wall-clock ISO string", () => {
      const d = new Date(Date.UTC(2026, 9, 27, 19, 30, 0));
      expect(formatWallClockUtc(d)).toBe("2026-10-27T19:30:00");
    });
  });

  describe("Recurrence expansion after 6 PM (timezone immunity)", () => {
    it("generates Tuesday occurrences for 7:00 PM (19:00) on Tuesday, NOT Monday", () => {
      // Simulating a recurring timeblock at 19:00 on Tuesday, repeating every Tuesday
      const parentStartTime = "2026-10-27T19:00:00"; // Tuesday
      const ruleStr = "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=TU";
      const startRange = "2026-10-25";
      const endRange = "2026-11-10";

      const startDateUtc = parseWallClockUtc(startRange + "T00:00:00");
      const endDateUtc = parseWallClockUtc(endRange + "T23:59:59");

      let dtstart = parseWallClockUtc(parentStartTime);
      const day = dtstart.getUTCDay();
      const diffToMon = day === 0 ? -6 : 1 - day;
      dtstart.setUTCDate(dtstart.getUTCDate() + diffToMon);

      const rule = rrulestr(ruleStr, { dtstart });
      const occs = rule.between(startDateUtc, endDateUtc, true);

      const pad = (n: number) => String(n).padStart(2, "0");
      const results = occs.map(
        occ => `${occ.getUTCFullYear()}-${pad(occ.getUTCMonth() + 1)}-${pad(occ.getUTCDate())}T19:00:00`
      );

      expect(results).toContain("2026-10-27T19:00:00");
      expect(results).toContain("2026-11-03T19:00:00");
      // Must NOT contain Monday (the day before)
      expect(results).not.toContain("2026-10-26T19:00:00");
      expect(results).not.toContain("2026-11-02T19:00:00");
    });

    it("generates correct occurrences for 11:30 PM (23:30) repeating Wednesday and Friday", () => {
      const parentStartTime = "2026-10-28T23:30:00"; // Wednesday
      const ruleStr = "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=WE,FR";
      const startRange = "2026-10-25";
      const endRange = "2026-11-01";

      const startDateUtc = parseWallClockUtc(startRange + "T00:00:00");
      const endDateUtc = parseWallClockUtc(endRange + "T23:59:59");

      let dtstart = parseWallClockUtc(parentStartTime);
      const day = dtstart.getUTCDay();
      const diffToMon = day === 0 ? -6 : 1 - day;
      dtstart.setUTCDate(dtstart.getUTCDate() + diffToMon);

      const rule = rrulestr(ruleStr, { dtstart });
      const occs = rule.between(startDateUtc, endDateUtc, true);

      const pad = (n: number) => String(n).padStart(2, "0");
      const results = occs.map(
        occ => `${occ.getUTCFullYear()}-${pad(occ.getUTCMonth() + 1)}-${pad(occ.getUTCDate())}T23:30:00`
      );

      expect(results).toEqual([
        "2026-10-28T23:30:00", // Wed
        "2026-10-30T23:30:00", // Fri
      ]);
    });
  });

  describe("Exception matching with normalization", () => {
    it("matches exception originalStart without seconds to occurrence with seconds", () => {
      const occurrenceStart = "2026-10-27T19:00:00";
      const exceptionOriginalStart = "2026-10-27T19:00";

      expect(normalizeIso(exceptionOriginalStart)).toBe(occurrenceStart);
    });
  });
});

const parent = (values: Partial<Timeblock> = {}): Timeblock => ({
  id: "series", title: "Evening", taskIds: [],
  startTime: "2026-10-27T19:00:00-06:00", endTime: "2026-10-27T20:00:00-06:00",
  timeZone: "America/Denver", recurrenceRule: "RRULE:FREQ=WEEKLY;BYDAY=TU", ...values,
});

describe("actual calendar recurrence expansion", () => {
  it("keeps weekly evening events on Tuesday and changes the offset across fall-back", () => {
    const event = parent();
    const result = expandTimeblocks([event], [event], "2026-10-25T00:00:00", "2026-11-10T00:00:00", "America/Denver");
    expect(result.map(block => block.startTime)).toEqual(["2026-10-27T19:00:00-06:00", "2026-11-03T19:00:00-07:00"]);
  });

  it("never generates weekly occurrences before the series start", () => {
    const event = parent({ startTime: "2026-10-28T23:30:00", endTime: "2026-10-29T00:30:00", timeZone: undefined, recurrenceRule: "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR" });
    const result = expandTimeblocks([event], [event], "2026-10-25", "2026-11-01", "America/Denver");
    expect(result.map(block => block.startTime)).toEqual(["2026-10-28T23:30:00", "2026-10-30T23:30:00"]);
  });

  it("skips nonexistent spring-forward starts without consuming COUNT", () => {
    const event = parent({ startTime: "2026-03-07T02:30:00-07:00", endTime: "2026-03-07T03:30:00-07:00", recurrenceRule: "RRULE:FREQ=DAILY;COUNT=3" });
    const result = expandTimeblocks([event], [event], "2026-03-07", "2026-03-12", "America/Denver");
    expect(result.map(block => block.startTime)).toEqual(["2026-03-07T02:30:00-07:00", "2026-03-09T02:30:00-06:00", "2026-03-10T02:30:00-06:00"]);
  });

  it("preserves a later repeated-hour master without generating a duplicate", () => {
    const event = parent({ startTime: "2026-11-01T01:30:00-07:00", endTime: "2026-11-01T02:30:00-07:00", recurrenceRule: "RRULE:FREQ=DAILY;COUNT=2" });
    const result = expandTimeblocks([event], [event], "2026-11-01", "2026-11-03", "America/Denver");
    expect(result.map(block => block.startTime)).toEqual(["2026-11-01T01:30:00-07:00", "2026-11-02T01:30:00-07:00"]);
  });

  it("matches moved and deleted exceptions by original instant even with different offsets", () => {
    const event = parent();
    const exception: Timeblock = { id: "moved", taskIds: [], startTime: "2026-11-04T20:00:00-07:00", endTime: "2026-11-04T21:00:00-07:00", timeZone: "America/Denver", recurrenceId: event.id, originalStart: "2026-11-04T02:00:00Z" };
    const deleted = { ...exception, id: "deleted", originalStart: "2026-10-28T01:00:00Z", isDeleted: true };
    const result = expandTimeblocks([event, exception], [event, exception, deleted], "2026-10-25", "2026-11-10", "America/Denver");
    expect(result.map(block => block.id)).toEqual(["moved"]);
  });

  it("projects occurrences into another display zone and includes overnight continuations", () => {
    const event = parent({ startTime: "2026-10-27T23:00:00-06:00", endTime: "2026-10-28T02:00:00-06:00", recurrenceRule: "RRULE:FREQ=DAILY;COUNT=3" });
    const result = expandTimeblocks([], [event], "2026-10-29", "2026-10-30", "UTC");
    expect(result.map(block => block.startTime)).toEqual(["2026-10-28T23:00:00-06:00"]);
  });

  it("keeps all-day recurrence date-only and includes multiday occurrences beginning before the view", () => {
    const event = parent({ startTime: "2026-03-06", endTime: "2026-03-09", allDay: true, timeZone: undefined, recurrenceRule: "RRULE:FREQ=WEEKLY;COUNT=2" });
    const result = expandTimeblocks([], [event], "2026-03-14", "2026-03-15", "Asia/Tokyo");
    expect(result).toMatchObject([{ startTime: "2026-03-13", endTime: "2026-03-16", allDay: true }]);
    expect(result).toHaveLength(1);
  });

  it("stops this-and-following deletion at the chosen instant across daylight-saving changes", () => {
    const event = parent();
    const shortened = { ...event, recurrenceRule: truncateSeries(event, "2026-11-03T19:00:00-07:00", "America/Denver") };
    const result = expandTimeblocks([shortened], [shortened], "2026-10-25", "2026-11-15", "America/Denver");
    expect(result.map(block => block.startTime)).toEqual([event.startTime]);
  });
});
