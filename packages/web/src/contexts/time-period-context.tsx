import { createContext, useCallback, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { TimePeriod } from "@/components/filters/time-period-filter";

export interface TimePeriodContextValue {
  timePeriod: TimePeriod;
  setTimePeriod: (period: TimePeriod) => void;
  /** True when the user (or auto-switch) has explicitly set the period via URL param */
  isExplicit: boolean;
}

export const TimePeriodContext = createContext<TimePeriodContextValue | null>(
  null
);

const VALID_PRESETS = new Set([
  "this_month",
  "last_month",
  "last_3_months",
  "this_year",
  "last_year",
  "all_time",
]);

function parseTimePeriod(raw: string | null): TimePeriod | null {
  if (!raw) return null;
  if (VALID_PRESETS.has(raw)) return raw as TimePeriod;
  if (raw.startsWith("month:") && /^\d{4}-\d{2}$/.test(raw.slice(6))) {
    return raw as TimePeriod;
  }
  return null;
}

export function TimePeriodProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const isExplicit = searchParams.has("period");
  const timePeriod: TimePeriod =
    parseTimePeriod(searchParams.get("period")) ?? "this_month";

  const setTimePeriod = useCallback(
    (period: TimePeriod) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("period", period);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const value = useMemo(
    () => ({ timePeriod, setTimePeriod, isExplicit }),
    [timePeriod, setTimePeriod, isExplicit]
  );

  return (
    <TimePeriodContext.Provider value={value}>
      {children}
    </TimePeriodContext.Provider>
  );
}
