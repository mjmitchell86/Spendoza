import struct SpendozaKit.Transaction
import SpendozaKit
import SwiftUI

/// The Money tab's Transactions: search, a type menu and a category menu over the month's transactions grouped by
/// day. Tap one to move it to another category.
struct TransactionsView: View {
    @Bindable var model: TransactionsModel
    @State private var moving: Transaction?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            searchField.padding(.top, 16)
            filters.padding(.top, 10)
            if let error = model.actionError { InlineError(message: error).padding(.top, 12) }
            if let move = model.lastMove { undoBar(move).padding(.top, 12) }
            list.padding(.top, 8)
        }
        .onChange(of: model.lastMove) { _, move in
            if let move { UIAccessibility.post(notification: .announcement, argument: Self.undoText(move)) }
        }
        .sheet(item: $moving) { transaction in
            CategoryPickerSheet(transaction: transaction, current: transaction.category ?? TransactionsModel.uncategorized,
                                targets: model.pickerTargets(for: transaction),
                                offersUncategorized: model.offersUncategorized(for: transaction)) { name in
                Task { await model.recategorize(transaction, to: name) }
            }
        }
    }

    private var searchField: some View {
        TextField("", text: $model.search, prompt: Text("Search descriptions...").foregroundStyle(Theme.soft), axis: .vertical)
            // The prompt wraps at the largest text sizes instead of being clipped; Return ends the search rather than adding a line.
            .lineLimit(1...3)
            .font(.sans(16, relativeTo: .body))
            .foregroundStyle(Theme.ink)
            .tint(Theme.note)
            .autocorrectionDisabled()
            .submitLabel(.search)
            .onChange(of: model.search) { _, text in
                if text.contains("\n") { model.search = text.replacingOccurrences(of: "\n", with: "") }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
            .hairlineBorder(Theme.engraving)
            .accessibilityLabel("Search descriptions")
    }

    private var filters: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { typeMenu; categoryMenu; Spacer(minLength: 0) }
            VStack(alignment: .leading, spacing: 8) { typeMenu; categoryMenu }
        }
    }

    private var typeMenu: some View {
        filterMenu(title: model.type.rawValue, label: "Type") {
            ForEach(TransactionsModel.TypeFilter.allCases) { option in
                Button { model.type = option } label: { checked(option.rawValue, option == model.type) }
            }
        }
    }

    private var categoryMenu: some View {
        filterMenu(title: model.category.map { $0 } ?? "All categories", label: "Category") {
            Button { model.category = nil } label: { checked("All categories", model.category == nil) }
            Button { model.category = TransactionsModel.uncategorized } label: {
                checked(TransactionsModel.uncategorized, model.category == TransactionsModel.uncategorized)
            }
            ForEach(model.categoryChoices, id: \.id) { category in
                Button { model.category = category.name } label: { checked(category.name, model.category == category.name) }
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
            Button("Try again") { Task { await model.load() } }
                .buttonStyle(SecondaryButtonStyle())
                .padding(.top, 12)
        } else if model.isLoading && model.all.isEmpty {
            ProgressView().tint(Theme.note)
                .frame(maxWidth: .infinity, minHeight: 160)
                .accessibilityLabel("Loading transactions")
        } else if model.visible.isEmpty {
            Text("No transactions found.")
                .font(.sans(15, relativeTo: .subheadline))
                .foregroundStyle(Theme.soft)
                .padding(.top, 8)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                Text("Transactions (\(model.visible.count))")
                    .font(.serif(20, relativeTo: .title3))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.top, 16)
                    .padding(.bottom, 4)
                ForEach(model.days) { day in
                    Text(day.title)
                        .font(.sans(13, weight: .semibold, relativeTo: .footnote))
                        .foregroundStyle(Theme.soft)
                        .accessibilityAddTraits(.isHeader)
                        .padding(.top, 16)
                        .padding(.bottom, 2)
                    VStack(spacing: 0) {
                        ForEach(day.transactions) { transaction in
                            Button { moving = transaction } label: {
                                TransactionRow(transaction: transaction, showsSignAndCategory: true)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .topRule()
                }
            }
        }
    }

    private func undoBar(_ move: TransactionsModel.Move) -> some View {
        OutlinedPanel {
            HStack {
                Text(Self.undoText(move))
                    .font(.sans(14, relativeTo: .footnote))
                Spacer(minLength: 8)
                Button("Undo") { Task { await model.undo() } }
                    .font(.sans(14, weight: .semibold, relativeTo: .footnote))
                    .foregroundStyle(Theme.note)
                    .frame(minWidth: 44, minHeight: 44)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private static func undoText(_ move: TransactionsModel.Move) -> String {
        "Moved \(move.transaction.description) to \(move.destination)."
    }
}
