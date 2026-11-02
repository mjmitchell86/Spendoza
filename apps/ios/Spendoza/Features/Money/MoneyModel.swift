import Foundation
import Observation
import SpendozaKit

/// One entry of the month menu.
struct MoneyMonthChoice: Equatable, Identifiable {
    let month: Month
    let title: String
    var id: Month { month }
}

enum MoneyMonths {
    /// The month in progress ("October so far") and the 11 before it, newest first. Months in an earlier year
    /// carry their year. Other periods (last 3 months, this year) stay on the web and in Me > PDF reports.
    static func choices(now: Date, calendar: Calendar) -> [MoneyMonthChoice] {
        let current = soFarMonth(now: now, calendar: calendar)
        var months = [current]
        while months.count < 12 { months.append(months[months.count - 1].previous) }
        return months.enumerated().map { index, month in
            let title = index == 0 ? "\(month.name) so far" : month.year == current.year ? month.name : "\(month.name) \(month.year)"
            return MoneyMonthChoice(month: month, title: title)
        }
    }
}

/// The Money tab's month: the menu's choices and which one is selected. It opens on the last finished month that
/// has data, like Health.
@MainActor @Observable
final class MoneyModel {
    let choices: [MoneyMonthChoice]
    /// nil until `open()` has found the opening month.
    private(set) var selected: Month?

    @ObservationIgnored var onSessionEnded: (@MainActor () -> Void)?
    @ObservationIgnored var onAccountDisabled: (@MainActor (String) -> Void)?
    @ObservationIgnored private let api: any SpendozaAPI

    init(api: any SpendozaAPI, now: @escaping () -> Date = { AppClock.now }, calendar: Calendar = .current) {
        self.api = api
        choices = MoneyMonths.choices(now: now(), calendar: calendar)
    }

    var selectedTitle: String {
        choices.first { $0.month == selected }?.title ?? ""
    }

    func select(_ month: Month) { selected = month }

    /// Asks for finished months newest first and stops at the first with data; with none it opens on the last
    /// finished month, or on the month in progress when only that has data. Does nothing once a month is selected.
    func open() async {
        guard selected == nil else { return }
        let months = Array(choices.dropFirst().map(\.month)) + [choices[0].month]
        for month in months {
            do {
                if let report = try await api.personalReport(month), !report.data.hasNoData {
                    selected = month
                    return
                }
            } catch let error as APIError {
                switch error {
                case .unauthorized: onSessionEnded?(); return
                case .accountDisabled(let text): onAccountDisabled?(text); return
                default: continue
                }
            } catch {
                if Task.isCancelled { return }
            }
        }
        if Task.isCancelled { return }
        selected = choices[1].month
    }
}
