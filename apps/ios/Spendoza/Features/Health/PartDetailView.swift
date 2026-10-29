import SpendozaKit
import SwiftUI

/// One part of the score: the rule, where you stand against it, its five-month trend and what moved it.
struct PartDetailView: View {
    @State private var model: PartDetailModel
    let snapshot: HealthSnapshot
    let api: any SpendozaAPI
    @State private var budget: BudgetTarget?

    struct BudgetTarget: Identifiable {
        let categoryID: String
        let name: String
        let amount: Int
        var id: String { categoryID }
    }

    init(part: ScorePart, snapshot: HealthSnapshot, api: any SpendozaAPI) {
        self.snapshot = snapshot
        self.api = api
        _model = State(initialValue: PartDetailModel(part: part, snapshot: snapshot, api: api))
    }

    /// For render checks: a model already loaded.
    init(model: PartDetailModel, api: any SpendozaAPI) {
        self.snapshot = model.snapshot
        self.api = api
        _model = State(initialValue: model)
    }

    var body: some View {
        ScrollView { content }
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle(model.part.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(removing: .title)
            .task { await model.load() }
            .sheet(item: $budget) { target in
                BudgetSheet(categoryName: target.name, suggested: target.amount,
                            save: { goalName, amount in
                                await model.setBudget(categoryID: target.categoryID, categoryName: target.name,
                                                      goalName: goalName, amount: amount)
                            },
                            onSaved: {})
            }
    }

    /// The scrolling content (also what render checks draw, since ImageRenderer skips ScrollView).
    var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(model.part.title)
                .font(.serif(28, relativeTo: .largeTitle))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            figure.padding(.top, 4)
            if let rule = model.ruleText {
                Text(rule)
                    .font(.sans(15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.soft)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
            }
            if let meter = model.meter {
                ScoreMeter(meter: meter).padding(.top, 14)
            }
            if model.showsIncomeVersusExpenses { incomeVersusExpenses }
            trend.padding(.top, 20)
            if model.part.budgetClass != nil { whatMoved }
            guidance
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 32)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Pieces

    @Environment(\.dynamicTypeSize) private var typeSize

    private var pointsText: some View {
        Text("\(model.points)")
            .font(.serif(52, relativeTo: .largeTitle))
            .foregroundStyle(Theme.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
    }

    private var maxText: some View {
        Text("of \(model.max)")
            .font(.sans(15, relativeTo: .subheadline))
            .foregroundStyle(Theme.soft)
    }

    @ViewBuilder private var deltaText: some View {
        if let delta = model.delta {
            Text("\(PartRow.deltaText(delta)) since \(snapshot.report.month.previous.shortName)")
                .font(.sans(14, weight: .semibold, relativeTo: .subheadline))
                .foregroundStyle(delta < 0 ? Theme.oxblood : delta > 0 ? Theme.note : Theme.soft)
        }
    }

    private var figure: some View {
        Group {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 2) {
                    pointsText
                    maxText
                    deltaText
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    pointsText
                    maxText
                    Spacer(minLength: 8)
                    deltaText
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.figureAccessibility(model))
    }

    static func figureAccessibility(_ model: PartDetailModel) -> String {
        var text = "\(model.part.title), \(model.points) of \(model.max)"
        if let delta = model.delta {
            text += delta == 0 ? ", no change since \(model.sinceName)"
                : ", \(delta < 0 ? "down" : "up") \(abs(delta)) since \(model.sinceName)"
        }
        return text
    }

    private var incomeVersusExpenses: some View {
        VStack(spacing: 0) {
            moneyRow("Income", model.income)
            moneyRow("Spent", model.expenses)
            moneyRow("Left over", model.income - model.expenses)
        }
        .topRule()
        .padding(.top, 16)
    }

    private func moneyRow(_ title: String, _ value: Double) -> some View {
        RuledRow {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(.sans(15, relativeTo: .body)).foregroundStyle(Theme.ink)
                Spacer(minLength: 12)
                Text(value < 0 ? "−\(Money.whole(-value))" : Money.whole(value))
                    .font(.serif(17, relativeTo: .body)).foregroundStyle(Theme.ink)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title) \(Money.whole(value))")
    }

    private var trend: some View {
        let months = model.trendMonths
        let values = months.map { model.trend[$0].map(Double.init) }
        let summary = "\(model.part.title) points by month: " + zip(months, values).map { month, value in
            "\(month.name) \(value.map { String(Int($0)) } ?? "no report")"
        }.joined(separator: ", ")
        return TrendChart(months: months, values: values, ceiling: Double(model.max), summary: summary)
    }

    private var whatMoved: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("What moved it")
                .font(.serif(17, relativeTo: .headline))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
                .padding(.top, 24)
                .padding(.bottom, 8)
            if let error = model.loadError {
                InlineError(message: error)
            } else if model.movers.isEmpty {
                Text("No \(model.part.title.lowercased()) spending to show for \(snapshot.report.month.name).")
                    .font(.sans(15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.soft)
            } else {
                VStack(spacing: 0) {
                    ForEach(model.movers, id: \.category) { mover in
                        if let category = model.category(named: mover.category) {
                            NavigationLink {
                                CategoryDetailView(category: category, snapshot: snapshot, api: api)
                            } label: {
                                MoverRow(mover: mover, highlighted: mover.category == model.movers.first?.category
                                         && (mover.delta ?? 0) > 0)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .topRule()
            }
        }
    }

    @ViewBuilder private var guidance: some View {
        switch model.primaryAction {
        case .setBudget(let id, let name, let amount):
            if model.showsBudgetAction {
                Button("Set a \(Money.whole(Double(amount))) budget for \(name)") {
                    budget = BudgetTarget(categoryID: id, name: name, amount: amount)
                }
                .buttonStyle(PrimaryButtonStyle())
                .padding(.top, 20)
            } else {
                Text("Budget set for \(name).")
                    .font(.sans(14, relativeTo: .footnote))
                    .foregroundStyle(Theme.note)
                    .padding(.top, 20)
            }
        case .openEmergencyFund:
            // The Plan tab (where an emergency fund is set up) arrives later, so this is guidance, not a button.
            if let suggestion = model.suggestion {
                OutlinedPanel {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(suggestion.title).font(.serif(16, relativeTo: .headline))
                        Text(suggestion.detail)
                    }
                }
                .padding(.top, 20)
            }
        case .some(.none), nil:
            EmptyView()
        }
    }
}

/// A category under a part: name and this month's amount on the left, the change and a chevron on the right.
struct MoverRow: View {
    let mover: CategoryChange
    var highlighted = false

    var body: some View {
        RuledRow(highlighted: highlighted) {
            HStack(alignment: .center, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(mover.category).font(.sans(15, relativeTo: .body)).foregroundStyle(Theme.ink)
                    Text("\(Money.whole(mover.amount)) this month")
                        .font(.sans(12, relativeTo: .caption)).foregroundStyle(Theme.soft)
                }
                Spacer(minLength: 12)
                if let delta = mover.delta {
                    Text(Money.signed(delta))
                        .font(.sans(13, relativeTo: .footnote))
                        .foregroundStyle(delta > 0 ? Theme.oxblood : delta < 0 ? Theme.note : Theme.soft)
                        .fixedSize()
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.soft)
                    .accessibilityHidden(true)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.accessibilityText(mover))
    }

    static func accessibilityText(_ mover: CategoryChange) -> String {
        var text = "\(mover.category), \(Money.whole(mover.amount)) this month"
        if let delta = mover.delta {
            text += delta == 0 ? ", no change"
                : ", \(delta > 0 ? "up" : "down") \(Money.whole(abs(delta)))"
        }
        return text
    }
}
