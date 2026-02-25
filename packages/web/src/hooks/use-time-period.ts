import { useContext } from "react";
import { TimePeriodContext } from "@/contexts/time-period-context";

export function useTimePeriod() {
  const context = useContext(TimePeriodContext);
  if (!context)
    throw new Error("useTimePeriod must be used within TimePeriodProvider");
  return context;
}
