import SpendozaKit
import SwiftUI

/// The month in progress, read-only: where things stand so far, with no changes, no suggestions and no actions,
/// since a half-finished month would only ever look like a dip.
struct SoFarView: View {
    let report: Report

    var body: some View {
        ScrollView { content }
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("\(report.month.name) so far")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(removing: .title)
    }

    /// The scrolling content (also what render checks draw, since ImageRenderer skips ScrollView).
    var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(report.month.name) so far")
                .font(.serif(28, relativeTo: .largeTitle))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            Text("Not final until the month ends")
                .font(.sans(15, relativeTo: .subheadline))
                .foregroundStyle(Theme.soft)
                .padding(.top, 4)
            if let health = report.data.health {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("\(health.score)").font(.serif(52, relativeTo: .largeTitle))
                    Text("of 100").font(.sans(15, relativeTo: .subheadline)).foregroundStyle(Theme.soft)
                }
                .foregroundStyle(Theme.ink)
                .padding(.top, 8)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Health score \(health.score) of 100 so far")
                section("Score so far")
                VStack(spacing: 0) {
                    ForEach(ScorePart.allCases, id: \.self) { part in
                        if let score = health.parts[part] { partRow(part, score) }
                    }
                }
                .topRule()
            }
            section("Money so far")
            VStack(spacing: 0) {
                moneyRow("Income", report.data.totalIncome)
                moneyRow("Spent", report.data.totalExpenses)
            }
            .topRule()
            let categories = report.data.byCategory.sorted { $0.amount > $1.amount }
            if !categories.isEmpty {
                section("Spending by category")
                VStack(spacing: 0) {
                    ForEach(categories, id: \.category) { row in moneyRow(row.category, row.amount) }
                }
                .topRule()
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 32)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func section(_ title: String) -> some View {
        Text(title)
            .font(.serif(17, relativeTo: .headline))
            .foregroundStyle(Theme.ink)
            .accessibilityAddTraits(.isHeader)
            .padding(.top, 24)
            .padding(.bottom, 8)
    }

    private func partRow(_ part: ScorePart, _ score: PartScore) -> some View {
        RuledRow {
            HStack(alignment: .firstTextBaseline) {
                Text(part.title).font(.sans(15, relativeTo: .body)).foregroundStyle(Theme.ink)
                Spacer(minLength: 12)
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Text("\(score.points)").font(.serif(17, relativeTo: .body))
                    Text("/\(score.max)").font(.sans(14, relativeTo: .body))
                }
                .foregroundStyle(Theme.ink)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(part.title), \(score.points) of \(score.max)")
    }

    private func moneyRow(_ title: String, _ value: Double) -> some View {
        RuledRow {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(.sans(15, relativeTo: .body)).foregroundStyle(Theme.ink)
                Spacer(minLength: 12)
                Text(Money.whole(value)).font(.serif(17, relativeTo: .body)).foregroundStyle(Theme.ink)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(Money.whole(value))")
    }
}
