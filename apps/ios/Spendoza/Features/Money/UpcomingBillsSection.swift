import SwiftUI

/// A section title in the Money screens: Newsreader, a heading for VoiceOver.
struct MoneySectionTitle: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.serif(20, relativeTo: .title3))
            .foregroundStyle(Theme.ink)
            .accessibilityAddTraits(.isHeader)
            .padding(.top, 28)
            .padding(.bottom, 6)
    }
}

/// "Upcoming bills": the web's rows (name, an "Auto" mark, date with "(in Nd)", amount), amber when due within three days.
struct UpcomingBillsSection: View {
    let rows: [OverviewModel.UpcomingRow]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            MoneySectionTitle("Upcoming bills")
            if rows.isEmpty {
                Text("No upcoming bills found")
                    .font(.sans(15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.soft)
                    .padding(.top, 4)
            } else {
                VStack(spacing: 0) {
                    ForEach(rows) { row in
                        RuledRow(highlighted: row.isSoon) { content(row) }
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel(Self.accessibilityLabel(row))
                    }
                }
                .topRule()
            }
        }
    }

    private func content(_ row: OverviewModel.UpcomingRow) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                details(row)
                Spacer(minLength: 8)
                amount(row)
            }
            VStack(alignment: .leading, spacing: 2) {
                details(row)
                amount(row)
            }
        }
    }

    private func details(_ row: OverviewModel.UpcomingRow) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Text(row.name)
                    .font(.sans(16, relativeTo: .body))
                    .foregroundStyle(Theme.ink)
                if row.isAuto {
                    Text("Auto")
                        .font(.sans(11, weight: .semibold, relativeTo: .caption2))
                        .foregroundStyle(Theme.soft)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .hairlineBorder(Theme.engraving)
                }
            }
            Text(row.whenText)
                .font(.sans(13, weight: row.isSoon ? .semibold : .regular, relativeTo: .footnote))
                .foregroundStyle(row.isSoon ? Theme.amberText : Theme.soft)
        }
    }

    private func amount(_ row: OverviewModel.UpcomingRow) -> some View {
        Text(Money.cents(row.amount))
            .font(.serif(17, relativeTo: .body))
            .foregroundStyle(Theme.ink)
    }

    static func accessibilityLabel(_ row: OverviewModel.UpcomingRow) -> String {
        "\(row.name)\(row.isAuto ? ", auto-detected" : ""), \(Money.cents(row.amount)), \(row.whenText)"
    }
}
