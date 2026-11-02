import struct SpendozaKit.Transaction
import SpendozaKit
import SwiftUI

/// A transaction: description and date on the left, the amount and a chevron on the right.
struct TransactionRow: View {
    let transaction: Transaction
    /// The Money tab shows "+$…" / "−$…" and the category under the date; Health's debit-only list shows neither.
    var showsSignAndCategory = false
    /// False while the row selects instead of opening the category picker.
    var showsChevron = true
    /// False when the caller draws the row's rule (it adds more lines inside the same row).
    var ruled = true
    @Environment(\.dynamicTypeSize) private var typeSize

    private var amountText: String {
        showsSignAndCategory ? TransactionsModel.amountText(transaction) : Money.cents(transaction.amount)
    }

    private var subtitle: String {
        showsSignAndCategory ? (transaction.category ?? TransactionsModel.uncategorized) : shortDate(transaction.date)
    }

    /// The date is on screen once in the day header, so it is spoken once, after the category.
    private var spoken: String {
        showsSignAndCategory ? "\(subtitle), \(shortDate(transaction.date))" : subtitle
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(transaction.description).font(.sans(15, relativeTo: .body)).foregroundStyle(Theme.ink)
            Text(subtitle).font(.sans(12, relativeTo: .caption)).foregroundStyle(Theme.soft)
        }
    }

    private var amount: some View {
        Text(amountText).font(.serif(17, relativeTo: .body))
            .foregroundStyle(showsSignAndCategory && transaction.type == .credit ? Theme.note : Theme.ink)
            .fixedSize()
    }

    private var chevron: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Theme.soft)
            .accessibilityHidden(true)
    }

    @ViewBuilder var body: some View {
        if ruled { RuledRow { content } } else { content }
    }

    private var content: some View {
        Group {
            // At accessibility sizes the amount goes under the description, so the description keeps the full width.
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    details
                    HStack { amount; Spacer(minLength: 8); if showsChevron { chevron } }
                }
            } else {
                HStack(alignment: .center, spacing: 8) {
                    details
                    Spacer(minLength: 12)
                    amount
                    if showsChevron { chevron }
                }
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(transaction.description), \(amountText), \(spoken)")
        .accessibilityHint(showsChevron ? "Choose another category" : "")
    }
}

/// Choose the category a transaction belongs to (the same list the web's category menu offers).
struct CategoryPickerSheet: View {
    let transaction: Transaction
    let current: String
    let targets: [BudgetCategory]
    /// False when the transaction is already uncategorized.
    var offersUncategorized = true
    /// Why the category list couldn't load; the sheet then offers a retry instead of a list it doesn't have.
    var error: String?
    var retry: () async -> Void = {}
    /// nil moves the transaction to Uncategorized.
    let choose: (String?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var retrying = false

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
            if let error {
                VStack(alignment: .leading, spacing: 12) {
                    InlineError(message: error)
                    BusyButton(title: "Try again", busy: retrying) {
                        Task {
                            retrying = true
                            await retry()
                            retrying = false
                        }
                    }
                }
                .padding(.bottom, 12)
            }
            VStack(spacing: 0) {
                if offersUncategorized { row("Uncategorized", value: nil) }
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
