import SpendozaKit
import SwiftUI

/// The Money tab's Overview: money in against money out, spending by category, upcoming bills and the month's statements.
struct OverviewView: View {
    let model: OverviewModel
    @State private var refreshMessage: String?
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let error = model.loadError {
                InlineError(message: error).padding(.top, 16)
                Button("Try again") { Task { await model.load() } }
                    .buttonStyle(SecondaryButtonStyle())
                    .padding(.top, 12)
            } else if !model.hasLoaded {
                ProgressView().tint(Theme.note)
                    .frame(maxWidth: .infinity, minHeight: 240)
                    .accessibilityLabel("Loading \(model.month.name)")
            } else if model.isEmpty {
                Text(model.emptyText)
                    .font(.sans(15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.soft)
                    .padding(.top, 16)
                // Bills and statements are not tied to the report: a month with no transactions can still have them.
                extras
            } else {
                loaded
            }
        }
    }

    // MARK: Loaded

    @ViewBuilder private var loaded: some View {
        if let totals = model.totals {
            inAndOut(totals)
            summary(totals)
        }
        if !model.categoryRows.isEmpty {
            MoneySectionTitle("Spending by category")
            VStack(spacing: 0) {
                ForEach(model.categoryRows) { categoryRow($0) }
            }
            .topRule()
        }
        extras
        actions
    }

    @ViewBuilder private var extras: some View {
        UpcomingBillsSection(rows: model.upcomingRows)
        MonthStatementsSection(statements: model.statements)
    }

    /// Two engraved bars, income and spending, with their figures under them.
    private func inAndOut(_ totals: OverviewModel.Totals) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            EngravedBars(values: [totals.income, totals.expenses], highlightedIndex: 1, height: 88)
                .padding(.top, 16)
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 12) {
                    figure("Total income", totals.income)
                    figure("Total expenses", totals.expenses)
                }
            } else {
                HStack(alignment: .top, spacing: 6) {
                    figure("Total income", totals.income)
                    figure("Total expenses", totals.expenses)
                }
            }
        }
    }

    private func figure(_ label: String, _ amount: Double) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .font(.sans(13, relativeTo: .footnote))
                .foregroundStyle(Theme.soft)
            Text(Money.whole(amount))
                .font(.serif(26, relativeTo: .title2))
                .foregroundStyle(Theme.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 2)
        .accessibilityElement(children: .combine)
    }

    private func summary(_ totals: OverviewModel.Totals) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(spacing: 0) {
                labelledRow("Savings rate", totals.savingsRateText)
                labelledRow("Net", totals.net < 0 ? "−\(Money.whole(-totals.net))" : Money.whole(totals.net))
            }
            .topRule()
            .padding(.top, 16)
            if let note = totals.overspendNote {
                Text(note)
                    .font(.sans(14, relativeTo: .footnote))
                    .foregroundStyle(Theme.oxblood)
                    .padding(.top, 8)
            }
        }
    }

    private func labelledRow(_ label: String, _ value: String) -> some View {
        RuledRow {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline) {
                    Text(label).font(.sans(16, relativeTo: .body)).foregroundStyle(Theme.ink)
                    Spacer(minLength: 8)
                    Text(value).font(.serif(17, relativeTo: .body)).foregroundStyle(Theme.ink)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).font(.sans(16, relativeTo: .body)).foregroundStyle(Theme.ink)
                    Text(value).font(.serif(17, relativeTo: .body)).foregroundStyle(Theme.ink)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// Name, amount and share, with a thin bar scaled to the biggest category.
    private func categoryRow(_ row: OverviewModel.CategoryRow) -> some View {
        RuledRow {
            VStack(alignment: .leading, spacing: 6) {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(row.name).font(.sans(16, relativeTo: .body)).foregroundStyle(Theme.ink)
                        Spacer(minLength: 8)
                        amountText(row)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.name).font(.sans(16, relativeTo: .body)).foregroundStyle(Theme.ink)
                        amountText(row)
                    }
                }
                GeometryReader { proxy in
                    Theme.note.frame(width: max(proxy.size.width * row.barFraction, 2), height: 3)
                        .clipShape(RoundedRectangle(cornerRadius: 1.5))
                }
                .frame(height: 3)
                .accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(row.name), \(Money.whole(row.amount)), \(row.sharePercent) percent")
    }

    private func amountText(_ row: OverviewModel.CategoryRow) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(Money.whole(row.amount)).font(.serif(17, relativeTo: .body)).foregroundStyle(Theme.ink)
            Text("\(row.sharePercent)%").font(.sans(13, relativeTo: .footnote)).foregroundStyle(Theme.soft)
        }
    }

    // MARK: Actions

    @ViewBuilder private var actions: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let message = refreshMessage ?? model.exportError {
                InlineError(message: message)
            }
            Button {
                Task { refreshMessage = await model.refresh() }
            } label: {
                Text(model.refreshing ? "Generating…" : "Refresh report")
            }
            .buttonStyle(SecondaryButtonStyle())
            .disabled(model.refreshing)
        }
        .padding(.top, 28)
    }
}
