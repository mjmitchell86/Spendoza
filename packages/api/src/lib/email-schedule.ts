// Pure helper — no side-effectful imports so it can be unit-tested in CI
// without needing Supabase env vars.

const DAY_MAP: Record<string, string> = {
  sunday: "Sun",
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
};

export function isNewYearMidnight(
  timezone: string,
  now: Date = new Date()
): boolean {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const month = parseInt(
      parts.find((p) => p.type === "month")?.value ?? "0",
      10
    );
    const day = parseInt(
      parts.find((p) => p.type === "day")?.value ?? "0",
      10
    );
    const hour = parseInt(
      parts.find((p) => p.type === "hour")?.value ?? "-1",
      10
    );
    return month === 1 && day === 1 && hour === 0;
  } catch {
    return false;
  }
}

export function isScheduledTime(
  timezone: string,
  day: string,
  hour: number,
  now: Date = new Date()
): boolean {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const weekday = parts.find((p) => p.type === "weekday")?.value;
    const currentHour = parseInt(
      parts.find((p) => p.type === "hour")?.value ?? "-1",
      10
    );
    const targetDay = DAY_MAP[day] ?? "Sat";
    return weekday === targetDay && currentHour === hour;
  } catch {
    return false;
  }
}
