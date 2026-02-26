import { describe, it, expect } from "bun:test";
import { isScheduledTime } from "../../routes/emails";

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
