import Foundation

/// The check-up month: the latest month strictly before the current one that has a report.
/// The current month is still in progress, so it never counts.
public func checkupMonth(now: Date, calendar: Calendar, reportMonths: Set<Month>) -> Month? {
    let current = Month(date: now, calendar: calendar)
    return reportMonths.filter { $0 < current }.max()
}

/// The in-progress month, shown "so far".
public func soFarMonth(now: Date, calendar: Calendar) -> Month {
    Month(date: now, calendar: calendar)
}
