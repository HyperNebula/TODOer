import { describe, expect, it } from "vitest";
import type { Timeblock } from "../types/task";
import {
  addDays, dateAtMinutes, dayStartMs, instantMs, moveTimedBlock, normalizeSchedule,
  overlapsRange, segmentForDate, wallInZone, wallToTimestamp,
} from "./calendarDate";

const block = (values: Partial<Timeblock> = {}): Timeblock => ({
  id: "one", startTime: "2026-10-31T23:00:00-06:00", endTime: "2026-11-01T02:00:00-07:00",
  timeZone: "America/Denver", taskIds: [], ...values,
});

describe("calendar dates and time zones", () => {
  it("creates explicit offsets in the event zone in summer and winter", () => {
    expect(wallToTimestamp("2026-07-01T09:00", "America/Denver")).toBe("2026-07-01T09:00:00-06:00");
    expect(wallToTimestamp("2026-12-01T09:00", "America/Denver")).toBe("2026-12-01T09:00:00-07:00");
  });

  it("rejects nonexistent spring-forward times instead of silently moving them", () => {
    expect(() => wallToTimestamp("2026-03-08T02:30", "America/Denver")).toThrow(/does not exist/);
  });

  it("uses the earlier repeated hour for new events and preserves an existing later hour", () => {
    expect(wallToTimestamp("2026-11-01T01:30", "America/Denver")).toBe("2026-11-01T01:30:00-06:00");
    expect(wallToTimestamp("2026-11-01T01:30", "America/Denver", "2026-11-01T01:30:00-07:00")).toBe("2026-11-01T01:30:00-07:00");
  });

  it("rejects invalid time zones and reversed schedules", () => {
    expect(() => wallToTimestamp("2026-01-01T09:00", "Mars/Base")).toThrow(/valid IANA/);
    expect(() => normalizeSchedule(block({ endTime: "2026-10-31T22:00:00-06:00" }), "UTC")).toThrow(/after/);
  });

  it("preserves floating legacy timestamps until explicitly assigned a zone", () => {
    const legacy = block({ startTime: "2026-10-31T09:00", endTime: "2026-10-31T10:00", timeZone: undefined });
    expect(normalizeSchedule(legacy, "America/Denver", true)).toMatchObject({ startTime: "2026-10-31T09:00:00", timeZone: undefined });
    expect(normalizeSchedule({ ...legacy, timeZone: "America/Denver" }, "UTC")).toMatchObject({ startTime: "2026-10-31T09:00:00-06:00" });
  });

  it("converts explicit timestamps for display while leaving floating timestamps unchanged", () => {
    expect(wallInZone("2026-11-01T00:30:00+09:00", "UTC")).toBe("2026-10-31T15:30:00");
    expect(wallInZone("2026-11-01T00:30:00", "UTC")).toBe("2026-11-01T00:30:00");
  });

  it("uses 23- and 25-hour days at daylight-saving boundaries", () => {
    expect(dayStartMs("2026-03-09", "America/Denver") - dayStartMs("2026-03-08", "America/Denver")).toBe(23 * 3600_000);
    expect(dayStartMs("2026-11-02", "America/Denver") - dayStartMs("2026-11-01", "America/Denver")).toBe(25 * 3600_000);
  });

  it("handles midnight rollover and calendar-day arithmetic", () => {
    expect(dateAtMinutes("2026-10-31", 1470)).toBe("2026-11-01T00:30:00");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });
});

describe("calendar range projection", () => {
  it("clips an overnight event into both dates across a fall-back boundary", () => {
    expect(segmentForDate(block(), "2026-10-31", "America/Denver")).toMatchObject({ startMin: 1380, endMin: 1440, continuesAfter: true });
    expect(segmentForDate(block(), "2026-11-01", "America/Denver")).toMatchObject({ startMin: 0, endMin: 120, continuesBefore: true });
    expect(segmentForDate(block(), "2026-11-02", "America/Denver")).toBeNull();
  });

  it("places an event on the display date rather than its source date", () => {
    const event = block({ startTime: "2026-11-01T00:30:00+09:00", endTime: "2026-11-01T01:30:00+09:00", timeZone: "Asia/Tokyo" });
    expect(segmentForDate(event, "2026-10-31", "UTC")).toMatchObject({ startMin: 930, endMin: 990 });
    expect(segmentForDate(event, "2026-11-01", "UTC")).toBeNull();
  });

  it("clips to visible hours and excludes events ending exactly at a day boundary", () => {
    const event = block({ startTime: "2026-10-31T05:00:00Z", endTime: "2026-10-31T10:00:00Z", timeZone: "UTC" });
    expect(segmentForDate(event, "2026-10-31", "UTC", 480, 540)).toMatchObject({ startMin: 480, endMin: 540, continuesBefore: true, continuesAfter: true });
    expect(segmentForDate({ ...event, endTime: "2026-11-01T00:00:00Z" }, "2026-11-01", "UTC")).toBeNull();
  });

  it("preserves a legacy floating event in a skipped clock hour without rewriting it", () => {
    const event = block({ startTime: "2026-03-08T02:30:00", endTime: "2026-03-08T03:30:00", timeZone: undefined });
    expect(segmentForDate(event, "2026-03-08", "America/Denver")).toMatchObject({ startMin: 150, endMin: 210 });
    expect(overlapsRange(event, "2026-03-08", "2026-03-09", "America/Denver")).toBe(true);
  });

  it("keeps an event spanning the repeated hour visible", () => {
    const event = block({ startTime: "2026-11-01T01:45:00-06:00", endTime: "2026-11-01T01:15:00-07:00" });
    const segment = segmentForDate(event, "2026-11-01", "America/Denver")!;
    expect(segment.endMin).toBeGreaterThan(segment.startMin);
  });

  it("treats all-day end dates as exclusive regardless of display zone", () => {
    const event = block({ startTime: "2026-03-08", endTime: "2026-03-10", allDay: true, timeZone: undefined });
    for (const zone of ["America/Los_Angeles", "Asia/Tokyo", "UTC"]) {
      expect(overlapsRange(event, "2026-03-09T00:00:00", "2026-03-10T00:00:00", zone)).toBe(true);
      expect(overlapsRange(event, "2026-03-10T00:00:00", "2026-03-11T00:00:00", zone)).toBe(false);
    }
    expect(segmentForDate(event, "2026-03-09", "UTC")).toBeNull();
    expect(normalizeSchedule(event, "Asia/Tokyo").timeZone).toBeUndefined();
  });

  it("moves a zoned event by display calendar days without losing its event zone or duration", () => {
    const event = block({ startTime: "2026-03-07T09:00:00-07:00", endTime: "2026-03-07T10:00:00-07:00" });
    const moved = moveTimedBlock(event, 0, 1, "America/Denver");
    expect(moved).toEqual({ startTime: "2026-03-08T09:00:00-06:00", endTime: "2026-03-08T10:00:00-06:00" });
    expect(instantMs(moved.endTime, "UTC") - instantMs(moved.startTime, "UTC")).toBe(3600_000);
  });
});
