import SpendozaKit
import SwiftUI

/// "Statements this month": the month's statements (and any still being read) with where each one stands, in the
/// same words as the Statements list. The web shows only a processing banner; this list is app-only. Hidden when
/// there are none. Tap one to open it.
struct MonthStatementsSection: View {
    let rows: [StatementRow]
    var open: (String) -> Void = { _ in }

    var body: some View {
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                MoneySectionTitle("Statements this month")
                VStack(spacing: 0) {
                    ForEach(rows) { row in
                        Button { open(row.id) } label: {
                            RuledRow { line(row) }
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(row.accessibilitySummary)
                        .accessibilityHint(row.status == .parsed ? "Review its transactions" : "See its details")
                    }
                }
                .topRule()
            }
        }
    }

    private func line(_ row: StatementRow) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                names(row)
                Spacer(minLength: 8)
                StatementStatusText(row: row)
                chevron
            }
            VStack(alignment: .leading, spacing: 4) {
                names(row)
                HStack { StatementStatusText(row: row); Spacer(minLength: 8); chevron }
            }
        }
    }

    private func names(_ row: StatementRow) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(row.title)
                .font(.sans(16, relativeTo: .body))
                .foregroundStyle(Theme.ink)
            Text("\(row.monthText) · \(row.accountText)")
                .font(.sans(12, relativeTo: .caption))
                .foregroundStyle(Theme.soft)
        }
    }

    private var chevron: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Theme.soft)
            .accessibilityHidden(true)
    }
}
