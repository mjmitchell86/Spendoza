import { describe, it, expect } from "bun:test";
import { isScheduledTime, isNewYearMidnight } from "../../lib/email-schedule";

describe("isScheduledTime", () => {
  // Saturday Feb 21, 2026 at 14:00 UTC = 9:00 AM EST
  const saturdayMorningEST = new Date("2026-02-21T14:00:00Z");

  it("returns true when day and hour match", () => {
    expect(
      isScheduledTime("America/New_York", "saturday", 9, saturdayMorningEST)
    ).toBe(true);
  });

  it("returns false on wrong day", () => {
    expect(
      isScheduledTime("America/New_York", "wednesday", 9, saturdayMorningEST)
    ).toBe(false);
  });

  it("returns false on wrong hour", () => {
    expect(
      isScheduledTime("America/New_York", "saturday", 14, saturdayMorningEST)
    ).toBe(false);
  });

  it("works with different timezones", () => {
    // 14:00 UTC = 15:00 CET (Central European Time in winter)
    expect(
      isScheduledTime("Europe/Berlin", "saturday", 15, saturdayMorningEST)
    ).toBe(true);
    expect(
      isScheduledTime("Europe/Berlin", "saturday", 9, saturdayMorningEST)
    ).toBe(false);
  });

  it("works with custom schedule (e.g. Wednesday 2pm)", () => {
    // Wednesday Feb 25, 2026 at 19:00 UTC = 2:00 PM EST
    const wednesdayAfternoonEST = new Date("2026-02-25T19:00:00Z");
    expect(
      isScheduledTime(
        "America/New_York",
        "wednesday",
        14,
        wednesdayAfternoonEST
      )
    ).toBe(true);
  });

  it("falls back to Saturday for invalid day", () => {
    expect(
      isScheduledTime(
        "America/New_York",
        "notaday",
        9,
        saturdayMorningEST
      )
    ).toBe(true); // DAY_MAP returns "Sat" for unknown keys
  });

  it("handles invalid timezone gracefully", () => {
    expect(
      isScheduledTime("Invalid/Timezone", "saturday", 9, saturdayMorningEST)
    ).toBe(false);
  });
});

describe("isNewYearMidnight", () => {
  it("returns true at midnight Jan 1 EST", () => {
    // Jan 1, 2026 at 05:00 UTC = midnight EST (UTC-5)
    const midnightEST = new Date("2026-01-01T05:00:00Z");
    expect(isNewYearMidnight("America/New_York", midnightEST)).toBe(true);
  });

  it("returns false when not midnight", () => {
    // Jan 1, 2026 at 14:00 UTC = 9:00 AM EST
    const morningEST = new Date("2026-01-01T14:00:00Z");
    expect(isNewYearMidnight("America/New_York", morningEST)).toBe(false);
  });

  it("returns false on Dec 31 in user's timezone", () => {
    // Dec 31, 2025 at 20:00 UTC = 3:00 PM EST (still Dec 31)
    const dec31EST = new Date("2025-12-31T20:00:00Z");
    expect(isNewYearMidnight("America/New_York", dec31EST)).toBe(false);
  });

  it("works with UTC+14 (Line Islands)", () => {
    // Dec 31, 2025 at 10:00 UTC = Jan 1, 2026 00:00 in Pacific/Kiritimati (UTC+14)
    const midnightKiritimati = new Date("2025-12-31T10:00:00Z");
    expect(isNewYearMidnight("Pacific/Kiritimati", midnightKiritimati)).toBe(true);
  });

  it("works with UTC-12 (Baker Island)", () => {
    // Jan 1, 2026 at 12:00 UTC = Jan 1, 2026 00:00 in Etc/GMT+12 (UTC-12)
    const midnightBaker = new Date("2026-01-01T12:00:00Z");
    expect(isNewYearMidnight("Etc/GMT+12", midnightBaker)).toBe(true);
  });

  it("handles invalid timezone gracefully", () => {
    const midnightUTC = new Date("2026-01-01T00:00:00Z");
    expect(isNewYearMidnight("Invalid/Timezone", midnightUTC)).toBe(false);
  });
});
