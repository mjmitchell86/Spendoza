import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TimePeriod =
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "this_year"
  | "last_year"
  | "all_time";

const PERIOD_LABELS: Record<TimePeriod, string> = {
  this_month: "This Month",
  last_month: "Last Month",
  last_3_months: "Last 3 Months",
  this_year: "This Year",
  last_year: "Last Year",
  all_time: "All Time",
};

interface TimePeriodFilterProps {
  value: TimePeriod;
  onValueChange: (value: TimePeriod) => void;
}

export function TimePeriodFilter({ value, onValueChange }: TimePeriodFilterProps) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as TimePeriod)}>
      <SelectTrigger className="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(PERIOD_LABELS).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
