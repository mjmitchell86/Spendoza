import QuickLook
import SpendozaKit
import SwiftUI

/// The Money tab: a month menu and three segments. Tasks for Transactions and Bills fill their segments in.
struct MoneyView: View {
    enum Segment: String, CaseIterable, Identifiable {
        case overview = "Overview", transactions = "Transactions", bills = "Bills"
        var id: String { rawValue }
    }

    let api: any SpendozaAPI
    let onSessionEnded: @MainActor () -> Void
    let onAccountDisabled: @MainActor (String) -> Void
    @State private var model: MoneyModel
    @State private var overview: OverviewModel?
    @State private var transactions: TransactionsModel?
    @State private var segment = Segment.overview
    @State private var preview: URL?
    @State private var exporting = false

    init(api: any SpendozaAPI, onSessionEnded: @escaping @MainActor () -> Void,
         onAccountDisabled: @escaping @MainActor (String) -> Void) {
        self.api = api
        self.onSessionEnded = onSessionEnded
        self.onAccountDisabled = onAccountDisabled
        let model = MoneyModel(api: api)
        model.onSessionEnded = onSessionEnded
        model.onAccountDisabled = onAccountDisabled
        _model = State(initialValue: model)
    }

    var body: some View {
        NavigationStack {
            ScrollView { page }
                .refreshable {
                    switch segment {
                    case .transactions: await transactions?.load()
                    default: await overview?.load()
                    }
                }
                .background(Theme.paper.ignoresSafeArea())
                .navigationTitle("Money")
                .toolbar(.hidden, for: .navigationBar)
        }
        .task { await model.open() }
        .task(id: model.selected) { await showSelectedMonth() }
        .quickLookPreview($preview)
        .onChange(of: preview) { old, new in
            if new == nil, let old { PDFReportsModel.discard(old) }
        }
    }

    private var page: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Money")
                .font(.serif(28, relativeTo: .largeTitle))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            if model.selected == nil {
                ProgressView().tint(Theme.note)
                    .frame(maxWidth: .infinity, minHeight: 240)
                    .accessibilityLabel("Loading your money")
            } else {
                MoneyMonthMenu(model: model, canExport: overview?.report != nil, exporting: exporting) {
                    Task { await export() }
                }
                Picker("Section", selection: $segment) {
                    ForEach(Segment.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.bottom, 4)
                switch segment {
                case .overview:
                    if let overview { OverviewView(model: overview) }
                case .transactions:
                    if let transactions { TransactionsView(model: transactions) }
                case .bills:
                    EmptyView()
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 24)
        .padding(.bottom, 32)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Builds the Overview for the selected month (a month already shown is only reloaded) and loads it.
    private func showSelectedMonth() async {
        guard let month = model.selected else { return }
        if let current = overview, current.month == month, let list = transactions {
            async let overviewLoaded: Void = current.load()
            async let listLoaded: Void = list.load()
            _ = await (overviewLoaded, listLoaded)
            return
        }
        let next = OverviewModel(api: api, month: month)
        next.onSessionEnded = onSessionEnded
        next.onAccountDisabled = onAccountDisabled
        overview = next
        let list = TransactionsModel(api: api, month: month)
        list.onSessionEnded = onSessionEnded
        list.onAccountDisabled = onAccountDisabled
        transactions = list
        async let overviewLoaded: Void = next.load()
        async let listLoaded: Void = list.load()
        _ = await (overviewLoaded, listLoaded)
    }

    private func export() async {
        guard let overview else { return }
        exporting = true
        defer { exporting = false }
        preview = await overview.exportPDF()
    }
}
