import struct SpendozaKit.Transaction
import SpendozaKit
import SwiftUI

/// One spending category in the check-up month: amount and change, typical month, trend, its transactions
/// (tap one to move it to another category) and a budget.
struct CategoryDetailView: View {
    @State private var model: CategoryDetailModel
    @State private var moving: Transaction?
    @State private var settingBudget = false

    init(category: BudgetCategory, snapshot: HealthSnapshot, api: any SpendozaAPI) {
        _model = State(initialValue: CategoryDetailModel(category: category, snapshot: snapshot, api: api))
    }

    /// For render checks: a model already loaded.
    init(model: CategoryDetailModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        ScrollView { content }
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle(model.category.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(removing: .title)
            .task { await model.load() }
            .sheet(item: $moving) { transaction in
                CategoryPickerSheet(transaction: transaction, current: model.category.name, targets: model.moveTargets) { name in
                    Task { await model.recategorize(transaction, to: name) }
                }
            }
            .sheet(isPresented: $settingBudget) {
                BudgetSheet(categoryName: model.category.name, suggested: model.suggestedBudget,
                            defaultName: model.defaultBudgetName,
                            save: { await model.setBudget(name: $0, amount: $1) }, onSaved: {})
            }
    }

    /// The scrolling content (also what render checks draw, since ImageRenderer skips ScrollView).
    var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(model.category.name)
                .font(.serif(28, relativeTo: .largeTitle))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            amount.padding(.top, 4)
            if let typical = model.typicalMonthly {
                Text("You usually spend about \(Money.whole(typical)) a month here.")
                    .font(.sans(15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.soft)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
            }
            trend.padding(.top, 18)
            budget.padding(.top, 20)
            transactions
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 32)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var amount: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(Money.whole(model.total))
                .font(.serif(52, relativeTo: .largeTitle))
                .foregroundStyle(Theme.ink)
            Text("in \(model.month.name)")
                .font(.sans(15, relativeTo: .subheadline))
                .foregroundStyle(Theme.soft)
            Spacer(minLength: 8)
            if let delta = model.delta {
                Text(Money.signed(delta))
                    .font(.sans(14, weight: .semibold, relativeTo: .subheadline))
                    .foregroundStyle(delta > 0 ? Theme.oxblood : delta < 0 ? Theme.note : Theme.soft)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.amountAccessibility(model))
    }

    static func amountAccessibility(_ model: CategoryDetailModel) -> String {
        var text = "\(model.category.name), \(Money.whole(model.total)) in \(model.month.name)"
        if let delta = model.delta {
            text += delta == 0 ? ", no change since \(model.sinceName)"
                : ", \(delta > 0 ? "up" : "down") \(Money.whole(abs(delta))) since \(model.sinceName)"
        }
        return text
    }

    private var trend: some View {
        let months = model.trendMonths
        let values = months.map { model.trend[$0] }
        let summary = "\(model.category.name) by month: " + zip(months, values).map { month, value in
            "\(month.name) \(value.map { Money.whole($0) } ?? "no report")"
        }.joined(separator: ", ")
        return TrendChart(months: months, values: values, summary: summary)
    }

    @ViewBuilder private var budget: some View {
        if model.budgetSaved {
            Text("Budget set for \(model.category.name).")
                .font(.sans(14, relativeTo: .footnote))
                .foregroundStyle(Theme.note)
        } else {
            Button("Set a \(Money.whole(Double(model.suggestedBudget))) budget") { settingBudget = true }
                .buttonStyle(SecondaryButtonStyle())
        }
    }

    private var transactions: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Transactions")
                .font(.serif(17, relativeTo: .headline))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
                .padding(.top, 24)
                .padding(.bottom, 8)
            if let error = model.actionError { InlineError(message: error).padding(.bottom, 8) }
            if let move = model.lastMove { undoBar(move).padding(.bottom, 8) }
            if let error = model.loadError {
                InlineError(message: error)
            } else if model.isLoading {
                ProgressView().tint(Theme.note).frame(maxWidth: .infinity, minHeight: 60)
                    .accessibilityLabel("Loading transactions")
            } else if model.transactions.isEmpty {
                Text("No \(model.category.name) transactions in \(model.month.name).")
                    .font(.sans(15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.soft)
            } else {
                VStack(spacing: 0) {
                    ForEach(model.transactions) { transaction in
                        Button { moving = transaction } label: { TransactionRow(transaction: transaction) }
                            .buttonStyle(.plain)
                    }
                }
                .topRule()
            }
        }
    }

    private func undoBar(_ move: CategoryDetailModel.Move) -> some View {
        OutlinedPanel {
            HStack {
                Text("Moved \(move.transaction.description) to \(move.destination).")
                    .font(.sans(14, relativeTo: .footnote))
                Spacer(minLength: 8)
                Button("Undo") { Task { await model.undoLastMove() } }
                    .font(.sans(14, weight: .semibold, relativeTo: .footnote))
                    .foregroundStyle(Theme.note)
                    .frame(minWidth: 44, minHeight: 44)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// A transaction: description and date on the left, the amount and a chevron on the right.
struct TransactionRow: View {
    let transaction: Transaction

    var body: some View {
        RuledRow {
            HStack(alignment: .center, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(transaction.description).font(.sans(15, relativeTo: .body)).foregroundStyle(Theme.ink)
                    Text(shortDate(transaction.date)).font(.sans(12, relativeTo: .caption)).foregroundStyle(Theme.soft)
                }
                Spacer(minLength: 12)
                Text(Money.cents(transaction.amount)).font(.serif(17, relativeTo: .body)).foregroundStyle(Theme.ink)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.soft)
                    .accessibilityHidden(true)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(transaction.description), \(Money.cents(transaction.amount)), \(shortDate(transaction.date))")
        .accessibilityHint("Choose another category")
    }
}

/// Choose the category a transaction belongs to (the same list the web's category menu offers).
struct CategoryPickerSheet: View {
    let transaction: Transaction
    let current: String
    let targets: [BudgetCategory]
    /// nil moves the transaction to Uncategorized.
    let choose: (String?) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView { content }
            .background(Theme.paper.ignoresSafeArea())
            .presentationDetents([.medium, .large])
    }

    var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Move to another category")
                .font(.serif(22, relativeTo: .title2))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            Text("\(transaction.description) · \(Money.cents(transaction.amount)) · now in \(current)")
                .font(.sans(14, relativeTo: .footnote))
                .foregroundStyle(Theme.soft)
                .padding(.top, 4)
                .padding(.bottom, 12)
            VStack(spacing: 0) {
                row("Uncategorized", value: nil)
                ForEach(targets, id: \.id) { category in
                    row(category.name, value: category.name)
                }
            }
            .topRule()
            Button("Cancel") { dismiss() }
                .buttonStyle(SecondaryButtonStyle())
                .padding(.top, 16)
        }
        .padding(.horizontal, 20)
        .padding(.top, 24)
        .padding(.bottom, 24)
    }

    private func row(_ title: String, value: String?) -> some View {
        Button {
            choose(value)
            dismiss()
        } label: {
            RuledRow {
                Text(title).font(.sans(15, relativeTo: .body)).foregroundStyle(Theme.ink)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
