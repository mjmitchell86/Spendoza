import SpendozaKit
import SwiftUI

/// Your own sharing preferences, for every member: income, expenses, and (when sharing by category) which categories.
struct SharingSettingsView: View {
    @Bindable var model: SharingSettingsModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Your sharing preferences")
                .font(.serif(20, relativeTo: .title3))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            if let error = model.loadError, !model.loaded {
                InlineError(message: error)
                Button("Retry") { Task { await model.load() } }.buttonStyle(SecondaryButtonStyle())
            } else if model.loaded {
                incomeGroup
                expenseGroup
                if model.showsCategories { categoriesGroup }
                result
                Button { Task { await model.save() } } label: {
                    if model.saving { ProgressView().tint(Theme.onNote) } else { Text("Save preferences") }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!model.canSave)
                .opacity(model.canSave || model.saving ? 1 : 0.45)
                .accessibilityLabel(model.saving ? "Saving preferences" : "Save preferences")
            } else {
                ProgressView().tint(Theme.note).frame(maxWidth: .infinity).accessibilityLabel("Loading")
            }
        }
        .task { await model.load() }
    }

    private var incomeGroup: some View {
        VStack(alignment: .leading, spacing: 8) {
            group("Income sharing", help: "Choose how your income is shared with the household.")
            options([(IncomeSharing.all, "Share all income"), (.none, "Keep income private"),
                     (.partial, "Share a specific amount")], selection: model.income) {
                model.income = $0
                model.clearMessage()
            }
            if model.income == .partial {
                AuthField(label: "Shared amount", text: $model.amountText, keyboard: .decimalPad, placeholder: "0.00")
                    .onChange(of: model.amountText) { model.clearMessage() }
            }
        }
    }

    private var expenseGroup: some View {
        VStack(alignment: .leading, spacing: 8) {
            group("Expense sharing", help: "Choose how your expenses are shared with the household.")
            options([(ExpenseSharing.all, "Share all expenses"), (.none, "Keep expenses private"),
                     (.category, "Share by category (shared categories only)")], selection: model.expense) {
                model.expense = $0
                model.clearMessage()
                Task { await model.loadCategoriesIfNeeded() }
            }
        }
    }

    private var categoriesGroup: some View {
        VStack(alignment: .leading, spacing: 8) {
            group("Shared categories", help: "Shared with household")
            VStack(spacing: 0) {
                ForEach(model.categories, id: \.id) { category in
                    RuledRow {
                        Toggle(category.name, isOn: Binding(get: { model.isShared(category.id) },
                                                            set: { value in Task { await model.setShared(category.id, value) } }))
                            .font(.sans(16, relativeTo: .body))
                            .foregroundStyle(Theme.ink)
                            .tint(Theme.note)
                            .disabled(model.isUpdating(category.id))
                            .frame(minHeight: 34)
                    }
                }
            }
            .topRule()
            if let error = model.categoryError { AreaErrorView(error: error) }
        }
    }

    @ViewBuilder private var result: some View {
        switch model.message {
        case .saved:
            Text("Sharing preferences updated.")
                .font(.sans(14, weight: .semibold, relativeTo: .subheadline))
                .foregroundStyle(Theme.note)
        case .plan:
            PlanNotAvailableView()
        case .failed(let message):
            InlineError(message: message)
        case nil:
            EmptyView()
        }
    }

    private func group(_ title: String, help: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.sans(16, weight: .semibold, relativeTo: .body))
                .foregroundStyle(Theme.ink)
            Text(help)
                .font(.sans(13, relativeTo: .footnote))
                .foregroundStyle(Theme.soft)
        }
    }

    /// A list of radio rows; the chosen one is marked and announced as selected.
    private func options<T: Hashable>(_ items: [(T, String)], selection: T, choose: @escaping (T) -> Void) -> some View {
        VStack(spacing: 0) {
            ForEach(items, id: \.1) { value, title in
                Button { choose(value) } label: {
                    RuledRow {
                        HStack(spacing: 10) {
                            Image(systemName: value == selection ? "largecircle.fill.circle" : "circle")
                                .foregroundStyle(value == selection ? Theme.note : Theme.soft)
                                .accessibilityHidden(true)
                            Text(title)
                                .font(.sans(16, relativeTo: .body))
                                .foregroundStyle(Theme.ink)
                                .multilineTextAlignment(.leading)
                            Spacer(minLength: 0)
                        }
                        .frame(minHeight: 34)
                        .contentShape(Rectangle())
                    }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(value == selection ? .isSelected : [])
            }
        }
        .topRule()
    }
}
