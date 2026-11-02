import struct SpendozaKit.Transaction
import SpendozaKit
import SwiftUI

/// One statement: where it stands, and for a parsed one its transactions with a category edit and, for a shared
/// account in a household, "Assign to" per row and a select-and-assign bar.
struct StatementDetailView: View {
    let statements: StatementsModel
    @State private var model: StatementDetailModel
    @State private var moving: Transaction?
    @Environment(\.dismiss) private var dismiss

    init(api: any SpendozaAPI, statementID: String, statements: StatementsModel, selfID: @MainActor () -> String?,
         onSessionEnded: @escaping @MainActor () -> Void, onAccountDisabled: @escaping @MainActor (String) -> Void) {
        self.statements = statements
        let model = StatementDetailModel(api: api, statementID: statementID, poller: statements.poller)
        model.onSessionEnded = onSessionEnded
        model.onAccountDisabled = onAccountDisabled
        _model = State(initialValue: model)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let row = model.row {
                    header(row)
                    content(row)
                } else {
                    Text("This statement was removed.")
                        .font(.sans(15, relativeTo: .subheadline))
                        .foregroundStyle(Theme.soft)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, model.isSelecting ? 96 : 32)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Theme.paper.ignoresSafeArea())
        .navigationTitle("Statement")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(removing: .title)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if model.isSelecting { bulkBar }
        }
        .task { await model.load() }
        .refreshable { await model.load() }
        // Opening a screen restarts polling when something is still processing.
        .task { await statements.load() }
        // A parsed statement's transactions arrive when it finishes: load them then.
        .onChange(of: model.row?.status) { old, new in
            if new == .parsed, old != nil { Task { await model.load() } }
        }
        .onChange(of: model.row == nil) { _, gone in
            if gone { dismiss() }
        }
        .sheet(item: $moving) { transaction in
            CategoryPickerSheet(transaction: transaction, current: transaction.category ?? TransactionsModel.uncategorized,
                                targets: model.pickerTargets(for: transaction),
                                offersUncategorized: model.offersUncategorized(for: transaction)) { name in
                Task { await model.recategorize(transaction, to: name) }
            }
        }
    }

    // MARK: Header

    private func header(_ row: StatementRow) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(row.status == .parsed ? model.title : row.title)
                .font(.serif(24, relativeTo: .title))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            // A parsed statement's title already names the month.
            Text(row.status == .parsed ? row.accountText : "\(row.monthText) · \(row.accountText)")
                .font(.sans(14, relativeTo: .subheadline))
                .foregroundStyle(Theme.soft)
        }
    }

    // MARK: By status

    @ViewBuilder private func content(_ row: StatementRow) -> some View {
        switch row.status {
        case .uploaded:
            note("This statement has been uploaded and is waiting to be processed.")
        case .processing:
            processing(row)
        case .failed:
            if let failure = row.failure {
                StatementFailureBlock(failure: failure, busy: statements.busy.contains(row.id),
                                      retry: { Task { await statements.retry(row.id) } },
                                      remove: { Task { await statements.remove(row.id) } })
                    .padding(.top, 16)
            }
            if let error = statements.actionError { InlineError(message: error).padding(.top, 12) }
        case .parsed:
            transactions
        }
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.sans(15, relativeTo: .subheadline))
            .foregroundStyle(Theme.soft)
            .padding(.top, 16)
    }

    /// The four pipeline steps, with the one the server is on.
    private func processing(_ row: StatementRow) -> some View {
        let statement = model.statement
        let steps = ["extract_text", "extract_transactions", "classify_transactions", "match_and_insert"]
        let current = steps.firstIndex(of: statement?.pipelineStep ?? "") ?? 0
        let retries = statement?.retryCount ?? 0
        return VStack(alignment: .leading, spacing: 0) {
            note(retries > 0 ? "Retrying... (attempt \(retries + 1) of 3)" : "This statement is being processed.")
            VStack(spacing: 0) {
                ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                    RuledRow {
                        HStack(spacing: 10) {
                            stepIcon(index, current: current)
                            Text(Self.stepName(step, fileType: statement?.fileType ?? "pdf"))
                                .font(.sans(15, weight: index == current ? .semibold : .regular, relativeTo: .body))
                                .foregroundStyle(index > current ? Theme.soft : Theme.ink)
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityValue(index < current ? "done" : index == current ? "in progress" : "waiting")
                }
            }
            .topRule()
            .padding(.top, 12)
        }
    }

    @ViewBuilder private func stepIcon(_ index: Int, current: Int) -> some View {
        if index < current {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.note).accessibilityHidden(true)
        } else if index == current {
            ProgressView().controlSize(.small).tint(Theme.note)
        } else {
            Image(systemName: "circle").foregroundStyle(Theme.soft).accessibilityHidden(true)
        }
    }

    private static func stepName(_ step: String, fileType: String) -> String {
        step == "classify_transactions" ? "Classifying expenses" : StatementsModel.stepLabel(step, fileType: fileType)
    }

    // MARK: Transactions

    @ViewBuilder private var transactions: some View {
        if let error = model.actionError { InlineError(message: error).padding(.top, 12) }
        if let error = model.loadError {
            VStack(alignment: .leading, spacing: 12) {
                InlineError(message: error)
                Button("Retry") { Task { await model.load() } }.buttonStyle(SecondaryButtonStyle())
            }
            .padding(.top, 16)
        } else if model.isLoading && model.transactions.isEmpty {
            ProgressView().tint(Theme.note)
                .frame(maxWidth: .infinity, minHeight: 160)
                .accessibilityLabel("Loading transactions")
        } else if model.transactions.isEmpty {
            note("No transactions found for this statement.")
        } else {
            if model.canAssign { selectBar.padding(.top, 12) }
            ForEach(model.days) { day in
                Text(day.title)
                    .font(.sans(13, weight: .semibold, relativeTo: .footnote))
                    .foregroundStyle(Theme.soft)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.top, 16)
                    .padding(.bottom, 2)
                VStack(spacing: 0) {
                    ForEach(day.transactions) { transaction in transactionRow(transaction) }
                }
                .topRule()
            }
        }
    }

    private func transactionRow(_ transaction: Transaction) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                if model.isSelecting { model.toggle(transaction) } else { moving = transaction }
            } label: {
                HStack(spacing: 8) {
                    if model.isSelecting {
                        Image(systemName: model.selected.contains(transaction.id) ? "checkmark.square.fill" : "square")
                            .font(.system(size: 22))
                            .foregroundStyle(model.selected.contains(transaction.id) ? Theme.note : Theme.soft)
                            .frame(minWidth: 28)
                            .accessibilityHidden(true)
                    }
                    TransactionRow(transaction: transaction, showsSignAndCategory: true, showsChevron: !model.isSelecting)
                }
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(model.isSelecting && model.selected.contains(transaction.id) ? .isSelected : [])
            if model.canAssign, !model.isSelecting {
                assignMenu(transaction)
            }
            if let error = model.rowErrors[transaction.id] {
                Text(error)
                    .font(.sans(13, relativeTo: .footnote))
                    .foregroundStyle(Theme.oxblood)
                    .padding(.bottom, 8)
            }
        }
    }

    /// "Assign to: Ann Smith" or "Unassigned"; a menu of the household's members.
    private func assignMenu(_ transaction: Transaction) -> some View {
        let current = model.assignee(of: transaction)
        return Menu {
            ForEach(model.members) { member in
                Button { Task { await model.assign(transaction, to: member) } } label: {
                    if member.id == transaction.attributedTo { Label(member.displayName, systemImage: "checkmark") } else { Text(member.displayName) }
                }
            }
        } label: {
            HStack(spacing: 6) {
                Text("Assign to")
                    .foregroundStyle(Theme.soft)
                Text(current ?? "Unassigned")
                    .foregroundStyle(current == nil ? Theme.soft : Theme.note)
                    .fontWeight(.semibold)
                Image(systemName: "chevron.up.chevron.down").font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.soft)
                    .accessibilityHidden(true)
            }
            .font(.sans(13, relativeTo: .footnote))
            .frame(minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Assign to, \(current ?? "Unassigned"), \(transaction.description)")
        .padding(.leading, 2)
    }

    // MARK: Select and assign

    private var selectBar: some View {
        HStack {
            Button(model.isSelecting ? "Done" : "Select") {
                if model.isSelecting { model.stopSelecting() } else { model.startSelecting() }
            }
            .font(.sans(15, weight: .semibold, relativeTo: .callout))
            .foregroundStyle(Theme.note)
            .frame(minHeight: 44)
            .accessibilityHint(model.isSelecting ? "" : "Choose several transactions to assign at once")
            Spacer(minLength: 8)
            if model.isSelecting {
                Button(model.selectedCount == model.transactions.count ? "Select none" : "Select all") {
                    if model.selectedCount == model.transactions.count { model.deselectAll() } else { model.selectAll() }
                }
                .font(.sans(15, weight: .semibold, relativeTo: .callout))
                .foregroundStyle(Theme.note)
                .frame(minHeight: 44)
            }
        }
    }

    private var bulkBar: some View {
        VStack(spacing: 0) {
            HairlineRule()
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) { count; Spacer(minLength: 8); assignButton }
                VStack(alignment: .leading, spacing: 8) { count; assignButton }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
        }
        .background(Theme.paper)
    }

    private var count: some View {
        Text("\(model.selectedCount) selected")
            .font(.sans(15, weight: .semibold, relativeTo: .body))
            .foregroundStyle(Theme.ink)
    }

    private var assignButton: some View {
        Menu {
            ForEach(model.members) { member in
                Button(member.displayName) { Task { await model.assignSelected(to: member) } }
            }
        } label: {
            Text(model.isAssigning ? "Assigning..." : "Assign to...")
                .font(.sans(15, weight: .semibold, relativeTo: .callout))
                .foregroundStyle(Theme.onNote)
                .padding(.horizontal, 16)
                .frame(minHeight: 44)
                .background(Theme.note, in: RoundedRectangle(cornerRadius: Theme.corner))
        }
        .disabled(model.selectedCount == 0 || model.isAssigning)
        .opacity(model.selectedCount == 0 ? 0.5 : 1)
        .accessibilityLabel("Assign to")
        .accessibilityHint("Choose who the \(model.selectedCount) selected transactions belong to")
    }
}
