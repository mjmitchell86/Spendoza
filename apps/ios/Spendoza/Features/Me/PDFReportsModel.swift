import Foundation
import Observation
import SpendozaKit

/// One choice on the PDF reports screen.
struct PDFOption: Identifiable {
    let title: String
    let period: ReportPeriod
    var id: String { title }
}

/// The periods the app offers (the web dashboard's) and the export of one of them to a file the share sheet can open.
@Observable @MainActor
final class PDFReportsModel {
    let options: [PDFOption]
    /// The option being exported, if any.
    private(set) var exporting: PDFOption.ID?
    /// The last failure, in words for the screen; cleared when the next export starts.
    var error: String?

    @ObservationIgnored private let api: any SpendozaAPI

    init(api: any SpendozaAPI, now: Date, calendar: Calendar) {
        self.api = api
        let current = Month(date: now, calendar: calendar)
        var months = [current]
        while months.count < 12 { months.append(months[months.count - 1].previous) }
        var options = months.enumerated().map { index, month in
            PDFOption(title: index == 0 ? "\(month.name) \(month.year) so far" : "\(month.name) \(month.year)",
                      period: .month(month))
        }
        options.append(PDFOption(title: "Last 3 months",
                                 period: .range(from: months[2], to: current)))
        options.append(PDFOption(title: "This year",
                                 period: .range(from: Month(year: current.year, month: 1), to: current)))
        options.append(PDFOption(title: "Last year",
                                 period: .range(from: Month(year: current.year - 1, month: 1),
                                                to: Month(year: current.year - 1, month: 12))))
        self.options = options
    }

    /// Downloads the report and writes it, under the server's file name, to a fresh temporary folder.
    func export(_ option: PDFOption) async -> URL? {
        error = nil
        exporting = option.id
        defer { exporting = nil }
        do {
            let file = try await api.personalReportPDF(option.period)
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let url = folder.appendingPathComponent(file.filename)
            try file.data.write(to: url)
            return url
        } catch let failure as APIError {
            error = failure.userMessage
            return nil
        } catch {
            self.error = "The report couldn't be saved. Try again."
            return nil
        }
    }
}
