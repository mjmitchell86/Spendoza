import SpendozaKit
import SwiftUI

/// The Statements screen (the web's Bank Statements page): every statement with where it stands, Retry and
/// Remove on the ones that failed, and a tap to review the parsed ones.
struct StatementsView: View {
    let model: StatementsModel
    let api: any SpendozaAPI
    let incoming: IncomingStatements
    let selfID: @MainActor () -> String?
    let onSessionEnded: @MainActor () -> Void
    let onAccountDisabled: @MainActor (String) -> Void
    @State private var uploading = false
    @State private var opened: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Statements")
                    .font(.serif(28, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                Text("Upload and review your bank statements")
                    .font(.sans(15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.soft)
                    .padding(.top, 4)
                Button("Add statement") { uploading = true }
                    .buttonStyle(SecondaryButtonStyle())
                    .padding(.top, 16)
                if let error = model.actionError { InlineError(message: error).padding(.top, 12) }
                list.padding(.top, 8)
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 32)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Theme.paper.ignoresSafeArea())
        .navigationTitle("Statements")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(removing: .title)
        .task { await model.load() }
        .refreshable { await model.load() }
        .sheet(isPresented: $uploading) { UploadStatementSheet(model: model, incoming: incoming) }
        .navigationDestination(item: $opened) { id in
            StatementDetailView(api: api, statementID: id, statements: model, selfID: selfID,
                                onSessionEnded: onSessionEnded, onAccountDisabled: onAccountDisabled)
        }
    }

    @ViewBuilder private var list: some View {
        if let error = model.loadError {
            InlineError(message: error)
            Button("Retry") { Task { await model.load() } }
                .buttonStyle(SecondaryButtonStyle())
                .padding(.top, 12)
        } else if model.isLoading {
            ProgressView().tint(Theme.note)
                .frame(maxWidth: .infinity, minHeight: 160)
                .accessibilityLabel("Loading statements")
        } else if model.rows.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                Text("No bank statements uploaded.")
                Text("Upload your first statement to begin.")
            }
            .font(.sans(15, relativeTo: .subheadline))
            .foregroundStyle(Theme.soft)
            .padding(.top, 8)
        } else {
            VStack(spacing: 0) {
                ForEach(model.rows) { row in
                    StatementListRow(row: row, busy: model.busy.contains(row.id),
                                     open: { opened = row.id },
                                     retry: { Task { await model.retry(row.id) } },
                                     remove: { Task { await model.remove(row.id) } })
                }
            }
            .topRule()
        }
    }
}

/// A statement: bank, month and account on the left, its status on the right, and under it what it is doing or why it failed.
struct StatementListRow: View {
    let row: StatementRow
    let busy: Bool
    let open: () -> Void
    let retry: () -> Void
    let remove: () -> Void

    var body: some View {
        RuledRow {
            VStack(alignment: .leading, spacing: 8) {
                Button(action: open) {
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            names
                            Spacer(minLength: 8)
                            StatementStatusText(row: row)
                            chevron
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            names
                            HStack { StatementStatusText(row: row); Spacer(minLength: 8); chevron }
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(row.accessibilitySummary)
                .accessibilityHint(row.status == .parsed ? "Review its transactions" : "See its details")
                if let failure = row.failure {
                    StatementFailureBlock(failure: failure, busy: busy, retry: retry, remove: remove)
                }
            }
        }
    }

    private var names: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(row.title)
                .font(.sans(16, weight: .semibold, relativeTo: .body))
                .foregroundStyle(Theme.ink)
            Text("\(row.monthText) · \(row.accountText)")
                .font(.sans(13, relativeTo: .footnote))
                .foregroundStyle(Theme.soft)
        }
    }

    private var chevron: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Theme.soft)
            .accessibilityHidden(true)
    }
}

/// "Parsed" / "Failed" / "Processing" with the step it is on.
struct StatementStatusText: View {
    let row: StatementRow

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            HStack(spacing: 6) {
                if row.isWorking { ProgressView().controlSize(.small).tint(Theme.soft) }
                Text(row.statusText)
                    .font(.sans(14, weight: .semibold, relativeTo: .subheadline))
                    .foregroundStyle(color)
            }
            if let progress = row.progress {
                Text(progress)
                    .font(.sans(12, relativeTo: .caption))
                    .foregroundStyle(Theme.soft)
                    .multilineTextAlignment(.trailing)
            }
        }
    }

    private var color: Color {
        switch row.status {
        case .uploaded, .processing: Theme.soft
        case .parsed: Theme.note
        case .failed: Theme.oxblood
        }
    }
}

/// Why a statement failed, with Retry and Remove.
struct StatementFailureBlock: View {
    let failure: StatementRow.Failure
    let busy: Bool
    let retry: () -> Void
    let remove: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize
    /// Which of the two is in flight, for the "Retrying…" / "Removing…" labels.
    @State private var pending: Pending?

    private enum Pending { case retry, remove }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(failure.headline)
                .font(.sans(14, weight: .semibold, relativeTo: .subheadline))
                .foregroundStyle(Theme.ink)
            if let step = failure.step {
                Text(step).font(.sans(13, relativeTo: .footnote)).foregroundStyle(Theme.soft)
            }
            if let reason = failure.reason {
                Text(reason).font(.sans(13, relativeTo: .footnote)).foregroundStyle(Theme.oxblood)
            }
            buttons.padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .onChange(of: busy) { _, now in if !now { pending = nil } }
    }

    @ViewBuilder private var buttons: some View {
        if typeSize.isAccessibilitySize {
            VStack(spacing: 8) { retryButton; removeButton }
        } else {
            HStack(spacing: 10) { retryButton; removeButton }
        }
    }

    private var retryButton: some View {
        Button { pending = .retry; retry() } label: {
            Text(busy && pending == .retry ? "Retrying..." : "Retry")
        }
        .buttonStyle(SecondaryButtonStyle())
        .disabled(busy)
        .accessibilityHint("Read this statement again")
    }

    private var removeButton: some View {
        Button { pending = .remove; remove() } label: {
            Text(busy && pending == .remove ? "Removing..." : "Remove")
                .font(.sans(15, weight: .semibold, relativeTo: .callout))
                .foregroundStyle(Theme.oxblood)
                .frame(maxWidth: .infinity, minHeight: 44)
                .hairlineBorder(Theme.oxblood)
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .accessibilityHint("Delete this statement")
    }
}
