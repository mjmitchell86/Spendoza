import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

/** Built-in preset keys */
type PresetPeriod =
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "this_year"
  | "last_year"
  | "all_time";

/** A TimePeriod is either a preset or a custom month in the form `month:YYYY-MM` */
export type TimePeriod = PresetPeriod | `month:${string}`;

const PERIOD_LABELS: Record<PresetPeriod, string> = {
  this_month: "This Month",
  last_month: "Last Month",
  last_3_months: "Last 3 Months",
  this_year: "This Year",
  last_year: "Last Year",
  all_time: "All Time",
};

const CUSTOM_KEY = "__custom__";

interface TimePeriodFilterProps {
  value: TimePeriod;
  onValueChange: (value: TimePeriod) => void;
}

function currentYearMonth() {
  return new Date().toISOString().slice(0, 7);
}

function isCustom(v: TimePeriod): v is `month:${string}` {
  return v.startsWith("month:");
}

function formatMonthLabel(ym: string): string {
  const d = new Date(ym + "-01T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function TimePeriodFilter({ value, onValueChange }: TimePeriodFilterProps) {
  const custom = isCustom(value);
  const [customMonth, setCustomMonth] = useState(
    custom ? value.slice(6) : currentYearMonth()
  );

  const selectValue = custom ? CUSTOM_KEY : value;
  const displayLabel = custom ? formatMonthLabel(value.slice(6)) : undefined;

  function handleSelectChange(v: string) {
    if (v === CUSTOM_KEY) {
      onValueChange(`month:${customMonth}`);
    } else {
      onValueChange(v as TimePeriod);
    }
  }

  function handleMonthChange(ym: string) {
    setCustomMonth(ym);
    onValueChange(`month:${ym}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={selectValue} onValueChange={handleSelectChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue>{displayLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(PERIOD_LABELS).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_KEY}>Specific Month</SelectItem>
        </SelectContent>
      </Select>
      {custom && (
        <Input
          type="month"
          value={customMonth}
          onChange={(e) => handleMonthChange(e.target.value)}
          className="w-[160px]"
        />
      )}
    </div>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Convert a time period to from_date/to_date strings (YYYY-MM-DD).
 * Returns undefined values for "all_time".
 */
export function getDateRange(period: TimePeriod): {
  from_date?: string;
  to_date?: string;
} {
  if (isCustom(period)) {
    const ym = period.slice(6);
    const y = parseInt(ym.slice(0, 4));
    const m = parseInt(ym.slice(5, 7));
    return {
      from_date: `${ym}-01`,
      to_date: `${ym}-${lastDayOfMonth(y, m)}`,
    };
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-based

  switch (period) {
    case "this_month":
      return {
        from_date: `${year}-${pad(month)}-01`,
        to_date: `${year}-${pad(month)}-${lastDayOfMonth(year, month)}`,
      };
    case "last_month": {
      const lmDate = new Date(year, month - 2, 1);
      const lmYear = lmDate.getFullYear();
      const lmMonth = lmDate.getMonth() + 1;
      return {
        from_date: `${lmYear}-${pad(lmMonth)}-01`,
        to_date: `${lmYear}-${pad(lmMonth)}-${lastDayOfMonth(lmYear, lmMonth)}`,
      };
    }
    case "last_3_months": {
      const threeAgo = new Date(year, month - 4, 1);
      const taYear = threeAgo.getFullYear();
      const taMonth = threeAgo.getMonth() + 1;
      return {
        from_date: `${taYear}-${pad(taMonth)}-01`,
        to_date: `${year}-${pad(month)}-${lastDayOfMonth(year, month)}`,
      };
    }
    case "this_year":
      return {
        from_date: `${year}-01-01`,
        to_date: `${year}-12-31`,
      };
    case "last_year":
      return {
        from_date: `${year - 1}-01-01`,
        to_date: `${year - 1}-12-31`,
      };
    case "all_time":
      return {};
  }
}

/**
 * Convert a time period to a dashboard month param (YYYY-MM-01).
 * Returns undefined for multi-month periods (dashboard will use its default).
 */
export function getMonthParam(period: TimePeriod): string | undefined {
  if (isCustom(period)) {
    return period.slice(6) + "-01";
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  switch (period) {
    case "this_month":
      return `${year}-${pad(month)}-01`;
    case "last_month": {
      const lm = new Date(year, month - 2, 1);
      return `${lm.getFullYear()}-${pad(lm.getMonth() + 1)}-01`;
    }
    default:
      return undefined;
  }
}
