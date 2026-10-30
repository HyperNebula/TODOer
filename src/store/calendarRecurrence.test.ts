import { describe, expect, it } from "vitest";
import { normalizeIso, parseWallClockUtc, formatWallClockUtc } from "./calendarStore";
import { rrulestr } from "rrule";

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
