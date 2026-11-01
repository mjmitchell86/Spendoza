import SpendozaKit
import SwiftUI

/// "Statements this month": the month's statements with where each one stands. The web shows only a processing
/// banner; this list is app-only. Hidden when the month has none.
struct MonthStatementsSection: View {
    let statements: [Statement]

    var body: some View {
        if !statements.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                MoneySectionTitle("Statements this month")
                VStack(spacing: 0) {
                    ForEach(statements) { statement in
                        RuledRow { row(statement) }
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel("\(Self.title(statement)), \(Self.subtitle(statement)), \(Self.statusText(statement.status))")
                    }
                }
                .topRule()
            }
        }
    }

    private func row(_ statement: Statement) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                names(statement)
                Spacer(minLength: 8)
                status(statement)
            }
            VStack(alignment: .leading, spacing: 2) {
                names(statement)
                status(statement)
            }
        }
    }

    private func names(_ statement: Statement) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(Self.title(statement))
                .font(.sans(16, relativeTo: .body))
                .foregroundStyle(Theme.ink)
            Text(Self.subtitle(statement))
                .font(.sans(12, relativeTo: .caption))
                .foregroundStyle(Theme.soft)
        }
    }

    private func status(_ statement: Statement) -> some View {
        Text(Self.statusText(statement.status))
            .font(.sans(14, weight: .semibold, relativeTo: .subheadline))
            .foregroundStyle(Self.statusColor(statement.status))
    }

    /// The bank, else "Statement".
    static func title(_ statement: Statement) -> String {
        statement.bankName?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmptyText ?? "Statement"
    }

    /// "PDF" or "CSV", with the account label when there is one.
    static func subtitle(_ statement: Statement) -> String {
        let kind = statement.fileType.uppercased()
        guard let label = statement.accountLabel?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmptyText else { return kind }
        return "\(kind) · \(label)"
    }

    static func statusText(_ status: StatementStatus) -> String {
        switch status {
        case .uploaded: "Uploaded"
        case .processing: "Processing"
        case .parsed: "Done"
        case .failed: "Failed"
        }
    }

    static func statusColor(_ status: StatementStatus) -> Color {
        switch status {
        case .uploaded, .processing: Theme.soft
        case .parsed: Theme.note
        case .failed: Theme.oxblood
        }
    }
}

private extension String {
    var nonEmptyText: String? { isEmpty ? nil : self }
}
