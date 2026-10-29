import Foundation
import Testing
@testable import SpendozaKit

struct CheckupMonthTests {
    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/New_York")!
        return c
    }

    private func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12, _ min: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
    }

    private let sep = Month(year: 2026, month: 9)
    private let oct = Month(year: 2026, month: 10)
    private let nov = Month(year: 2026, month: 11)

    @Test func checkupSkipsCurrentMonth() {
        #expect(checkupMonth(now: date(2026, 11, 14), calendar: calendar, reportMonths: [sep, oct, nov]) == oct)
    }

    @Test func onlyCurrentMonthMeansNoCheckup() {
        #expect(checkupMonth(now: date(2026, 11, 14), calendar: calendar, reportMonths: [nov]) == nil)
    }

    @Test func firstMinutesOfNewMonth() {
        #expect(checkupMonth(now: date(2026, 11, 1, 0, 5), calendar: calendar, reportMonths: [oct]) == oct)
    }

    /// 4.14: 23:30 on Oct 31 in New York is already November in UTC; the check-up follows the person's calendar.
    @Test func lastMinutesOfAMonthUseThePersonsTimeZone() {
        let lateOct31 = date(2026, 10, 31, 23, 30)
        #expect(checkupMonth(now: lateOct31, calendar: calendar, reportMonths: [sep, oct]) == sep)
        #expect(soFarMonth(now: lateOct31, calendar: calendar) == oct)
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        #expect(checkupMonth(now: lateOct31, calendar: utc, reportMonths: [sep, oct]) == oct)
    }

    @Test func soFarIsCurrentMonth() {
        #expect(soFarMonth(now: date(2026, 11, 14), calendar: calendar) == nov)
    }

    @Test func noticeOnlyWhenNewer() {
        #expect(checkupNotice(latestCheckup: oct, lastNotified: sep) == "Your October check-up is ready")
        #expect(checkupNotice(latestCheckup: oct, lastNotified: oct) == nil)
        #expect(checkupNotice(latestCheckup: oct, lastNotified: nov) == nil)
        #expect(checkupNotice(latestCheckup: oct, lastNotified: nil) == "Your October check-up is ready")
        #expect(checkupNotice(latestCheckup: nil, lastNotified: sep) == nil)
    }
}
