import SpendozaKit
import SwiftUI

/// The Money tab's Bills: "Recurring expenses" with the web's type and category filters. Tap a bill to edit or
/// delete it. Income follows below in its own section.
struct BillsView: View {
    @Bindable var model: ExpensesModel
    let income: IncomeModel
    @State private var target: Target?
    @State private var incomeTarget: IncomeTarget?

    /// What the form sheet is for: a new bill or an existing one.
    struct Target: Identifiable {
        let bill: Expense?
        var id: String { bill?.id ?? "new" }
    }

    /// What the income sheet is for: a new entry or an existing one.
    struct IncomeTarget: Identifiable {
        let entry: IncomeEntry?
        var id: String { entry?.id ?? "new" }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            recurringExpenses
            recurringIncome.padding(.top, 32)
        }
        .task { await model.load() }
        .task { await income.load() }
        .sheet(item: $target) { target in
            ExpenseFormSheet(model: model, bill: target.bill)
        }
        .sheet(item: $incomeTarget) { target in
            IncomeFormSheet(model: income, entry: target.entry)
        }
    }

    // MARK: Recurring expenses

    private var recurringExpenses: some View {
        VStack(alignment: .leading, spacing: 0) {
            MoneySectionTitle("Recurring expenses")
            Button("Add expense") { target = Target(bill: nil) }
                .buttonStyle(SecondaryButtonStyle())
                .padding(.top, 4)
            filters.padding(.top, 12)
            list.padding(.top, 8)
        }
    }

    private var filters: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { typeMenu; categoryMenu; Spacer(minLength: 0) }
            VStack(alignment: .leading, spacing: 8) { typeMenu; categoryMenu }
        }
    }

    private var typeMenu: some View {
        filterMenu(title: model.filter.rawValue, label: "Type") {
            ForEach(ExpensesModel.TypeFilter.allCases) { option in
                Button { model.filter = option } label: { checked(option.rawValue, option == model.filter) }
            }
        }
    }

    private var categoryMenu: some View {
        let title = model.category.map { model.categoryName(for: $0) } ?? "All categories"
        return filterMenu(title: title, label: "Category") {
            Button { model.category = nil } label: { checked("All categories", model.category == nil) }
            ForEach(model.categoryChoices, id: \.id) { category in
                Button { model.category = category.id } label: { checked(category.name, model.category == category.id) }
            }
        }
    }

    @ViewBuilder private func checked(_ title: String, _ on: Bool) -> some View {
        if on { Label(title, systemImage: "checkmark") } else { Text(title) }
    }

    private func filterMenu<Items: View>(title: String, label: String, @ViewBuilder items: () -> Items) -> some View {
        Menu {
            items()
        } label: {
            HStack(spacing: 8) {
                Text(title).lineLimit(1)
                Image(systemName: "chevron.down").font(.system(size: 11, weight: .semibold)).accessibilityHidden(true)
            }
            .font(.sans(15, weight: .semibold, relativeTo: .callout))
            .foregroundStyle(Theme.note)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .hairlineBorder(Theme.note)
        }
        .accessibilityLabel("\(label), \(title)")
    }

    @ViewBuilder private var list: some View {
        if let error = model.loadError {
            InlineError(message: error)
            Button("Retry") { Task { await model.load() } }
                .buttonStyle(SecondaryButtonStyle())
                .padding(.top, 12)
        } else if model.isLoading && model.expenses.isEmpty {
            ProgressView().tint(Theme.note)
                .frame(maxWidth: .infinity, minHeight: 120)
                .accessibilityLabel("Loading expenses")
        } else if model.expenses.isEmpty {
            emptyText("No expenses yet.", detail: "Add your first expense to get started.")
        } else if model.rows.isEmpty {
            emptyText("No expenses match your filters.", detail: nil)
        } else {
            VStack(spacing: 0) {
                ForEach(model.rows) { row in
                    Button { target = Target(bill: model.expenses.first { $0.id == row.id }) } label: {
                        BillRow(row: row)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(BillRow.accessibilityLabel(row))
                    .accessibilityHint("Edit or delete")
                }
            }
            .topRule()
        }
    }

    // MARK: Recurring income

    private var recurringIncome: some View {
        VStack(alignment: .leading, spacing: 0) {
            MoneySectionTitle("Recurring income")
            Button("Add income") { incomeTarget = IncomeTarget(entry: nil) }
                .buttonStyle(SecondaryButtonStyle())
                .padding(.top, 4)
            incomeList.padding(.top, 8)
        }
    }

    @ViewBuilder private var incomeList: some View {
        if let error = income.loadError {
            InlineError(message: error)
            Button("Retry") { Task { await income.load() } }
                .buttonStyle(SecondaryButtonStyle())
                .padding(.top, 12)
        } else if income.isLoading && income.entries.isEmpty {
            ProgressView().tint(Theme.note)
                .frame(maxWidth: .infinity, minHeight: 120)
                .accessibilityLabel("Loading income")
        } else if income.entries.isEmpty {
            emptyText("No income entries yet.", detail: "Add your first income source to get started.")
        } else {
            VStack(spacing: 0) {
                ForEach(income.rows) { row in
                    Button { incomeTarget = IncomeTarget(entry: income.entries.first { $0.id == row.id }) } label: {
                        IncomeRow(row: row)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(IncomeRow.accessibilityLabel(row))
                    .accessibilityHint("Edit")
                }
            }
            .topRule()
        }
    }

    private func emptyText(_ text: String, detail: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(text).foregroundStyle(Theme.ink)
            if let detail { Text(detail).foregroundStyle(Theme.soft) }
        }
        .font(.sans(15, relativeTo: .subheadline))
        .padding(.top, 8)
    }
}

/// One bill: its name (and raw description), marks, category, frequency and due date, and its amount.
private struct BillRow: View {
    let row: ExpensesModel.Row
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        RuledRow {
            Group {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 4) {
                        details
                        amount(alignment: .leading)
                    }
                } else {
                    HStack(alignment: .top, spacing: 12) {
                        details
                        Spacer(minLength: 8)
                        amount(alignment: .trailing)
                    }
                }
            }
            .frame(minHeight: 44)
        }
        .contentShape(Rectangle())
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(row.title)
                .font(.sans(16, relativeTo: .body))
                .foregroundStyle(Theme.ink)
            if let raw = row.rawDescription {
                Text(raw)
                    .font(.sans(12, relativeTo: .caption))
                    .foregroundStyle(Theme.soft)
            }
            if row.isAuto || row.isAIAdjusted {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 6) { marks }
                    VStack(alignment: .leading, spacing: 4) { marks }
                }
            }
            Text("\(row.categoryName) · \(row.frequencyLabel) · Due \(row.dueText)")
                .font(.sans(13, relativeTo: .footnote))
                .foregroundStyle(Theme.soft)
        }
    }

    @ViewBuilder private var marks: some View {
        if row.isAuto { mark("Auto-detected") }
        if row.isAIAdjusted { mark("AI adjusted") }
    }

    private func mark(_ text: String) -> some View {
        Text(text)
            .font(.sans(11, weight: .semibold, relativeTo: .caption2))
            .foregroundStyle(Theme.soft)
            .padding(.horizontal, 5)
            .padding(.vertical, 1)
            .hairlineBorder(Theme.engraving)
    }

    private func amount(alignment: HorizontalAlignment) -> some View {
        VStack(alignment: alignment, spacing: 0) {
            if let original = row.originalAmountText {
                Text(original)
                    .strikethrough()
                    .font(.sans(13, relativeTo: .footnote))
                    .foregroundStyle(Theme.soft)
            }
            Text(row.amountText)
                .font(.serif(17, relativeTo: .body))
                .foregroundStyle(Theme.ink)
        }
    }

    static func accessibilityLabel(_ row: ExpensesModel.Row) -> String {
        var parts = [row.title]
        if let raw = row.rawDescription { parts.append(raw) }
        if row.isAuto { parts.append("auto-detected") }
        if row.isAIAdjusted { parts.append("AI adjusted") }
        parts.append(row.amountText)
        if let original = row.originalAmountText { parts.append("was \(original)") }
        parts += [row.categoryName, row.frequencyLabel, "due \(row.dueText)"]
        return parts.joined(separator: ", ")
    }
}

/// One income entry: its name (and raw source name), marks, frequency and effective date, and its amount.
private struct IncomeRow: View {
    let row: IncomeModel.Row
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        RuledRow {
            Group {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 4) {
                        details
                        amount
                    }
                } else {
                    HStack(alignment: .top, spacing: 12) {
                        details
                        Spacer(minLength: 8)
                        amount
                    }
                }
            }
            .frame(minHeight: 44)
        }
        .contentShape(Rectangle())
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(row.title)
                .font(.sans(16, relativeTo: .body))
                .foregroundStyle(Theme.ink)
            if let raw = row.rawSourceName {
                Text(raw)
                    .font(.sans(12, relativeTo: .caption))
                    .foregroundStyle(Theme.soft)
            }
            if !row.marks.isEmpty {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 6) { marks }
                    VStack(alignment: .leading, spacing: 4) { marks }
                }
            }
            Text("\(row.frequencyLabel) · From \(row.effectiveText)")
                .font(.sans(13, relativeTo: .footnote))
                .foregroundStyle(Theme.soft)
        }
    }

    private var marks: some View {
        ForEach(row.marks, id: \.self) { text in
            Text(text)
                .font(.sans(11, weight: .semibold, relativeTo: .caption2))
                .foregroundStyle(Theme.soft)
                .padding(.horizontal, 5)
                .padding(.vertical, 1)
                .hairlineBorder(Theme.engraving)
        }
    }

    private var amount: some View {
        Text(row.amountText)
            .font(.serif(17, relativeTo: .body))
            .foregroundStyle(Theme.ink)
    }

    static func accessibilityLabel(_ row: IncomeModel.Row) -> String {
        var parts = [row.title]
        if let raw = row.rawSourceName { parts.append(raw) }
        parts += row.marks
        parts += [row.amountText, row.frequencyLabel, "from \(row.effectiveText)"]
        return parts.joined(separator: ", ")
    }
}
