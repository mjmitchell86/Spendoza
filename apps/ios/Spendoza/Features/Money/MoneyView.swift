import QuickLook
import SpendozaKit
import SwiftUI

/// The Money tab: a month menu and three segments.
struct MoneyView: View {
    enum Segment: String, CaseIterable, Identifiable {
        case overview = "Overview", transactions = "Transactions", bills = "Bills"
        var id: String { rawValue }
    }

    let api: any SpendozaAPI
    let poller: StatementPoller
    let incoming: IncomingStatements
    /// Files opened from outside wait for the app to be unlocked.
    let isLocked: Bool
    let selfID: @MainActor () -> String?
    let onSessionEnded: @MainActor () -> Void
    let onAccountDisabled: @MainActor (String) -> Void
    @State private var model: MoneyModel
    @State private var overview: OverviewModel?
    @State private var transactions: TransactionsModel?
    @State private var bills: ExpensesModel
    @State private var income: IncomeModel
    @State private var statements: StatementsModel
    @State private var segment = Segment.overview
    @State private var preview: URL?
    @State private var exporting = false
    @State private var showingCategories = false
    @State private var showingStatements = false
    @State private var openedStatement: String?
    @State private var addingStatement = false
    @State private var categoriesChanged = false

    init(api: any SpendozaAPI, poller: StatementPoller, incoming: IncomingStatements, isLocked: Bool, selfID: @escaping @MainActor () -> String?,
         onSessionEnded: @escaping @MainActor () -> Void, onAccountDisabled: @escaping @MainActor (String) -> Void) {
        self.api = api
        self.poller = poller
        self.incoming = incoming
        self.isLocked = isLocked
        self.selfID = selfID
        self.onSessionEnded = onSessionEnded
        self.onAccountDisabled = onAccountDisabled
        let model = MoneyModel(api: api)
        model.onSessionEnded = onSessionEnded
        model.onAccountDisabled = onAccountDisabled
        _model = State(initialValue: model)
        let bills = ExpensesModel(api: api)
        bills.onSessionEnded = onSessionEnded
        bills.onAccountDisabled = onAccountDisabled
        _bills = State(initialValue: bills)
        let income = IncomeModel(api: api, selfID: selfID)
        income.onSessionEnded = onSessionEnded
        income.onAccountDisabled = onAccountDisabled
        _income = State(initialValue: income)
        let statements = StatementsModel(api: api, poller: poller)
        statements.onSessionEnded = onSessionEnded
        statements.onAccountDisabled = onAccountDisabled
        _statements = State(initialValue: statements)
    }

    var body: some View {
        NavigationStack {
            ScrollView { page }
                // On the Overview's own page, so the screens pushed over it don't carry the button.
                .overlay(alignment: .bottomTrailing) {
                    if segment == .overview, model.selected != nil, overview?.offersAddStatement != true { addStatementButton }
                }
                .refreshable {
                    switch segment {
                    case .transactions: await transactions?.load()
                    case .bills:
                        async let billsLoaded: Void = bills.load()
                        async let incomeLoaded: Void = income.load()
                        _ = await (billsLoaded, incomeLoaded)
                    default: await overview?.load()
                    }
                }
                .background(Theme.paper.ignoresSafeArea())
                .navigationTitle("Money")
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(isPresented: $showingCategories) {
                    CategoriesView(api: api, onSessionEnded: onSessionEnded, onAccountDisabled: onAccountDisabled) {
                        categoriesChanged = true
                    }
                }
                .navigationDestination(item: $openedStatement) { id in
                    StatementDetailView(api: api, statementID: id, statements: statements, selfID: selfID,
                                        onSessionEnded: onSessionEnded, onAccountDisabled: onAccountDisabled)
                }
                .navigationDestination(isPresented: $showingStatements) {
                    StatementsView(model: statements, api: api, incoming: incoming, selfID: selfID,
                                   onSessionEnded: onSessionEnded, onAccountDisabled: onAccountDisabled)
                }
        }
        .sheet(isPresented: $addingStatement) { UploadStatementSheet(model: statements, incoming: incoming) }
        .onChange(of: openedFilesAreWaiting, initial: true) { _, waiting in
            if waiting { addingStatement = true }
        }
        .task { await model.open() }
        .task(id: model.selected) { await showSelectedMonth() }
        .onChange(of: showingCategories) { _, showing in
            if !showing, categoriesChanged { Task { await reloadAfterCategoryChange() } }
        }
        .quickLookPreview($preview)
        .onChange(of: preview) { old, new in
            if new == nil, let old { PDFReportsModel.discard(old) }
        }
    }

    private var openedFilesAreWaiting: Bool { !incoming.pending.isEmpty && !isLocked }

    private var page: some View {
        VStack(alignment: .leading, spacing: 0) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 16) { title; Spacer(minLength: 8); statementsLink; categoriesLink }
                VStack(alignment: .leading, spacing: 4) { title; statementsLink; categoriesLink }
            }
            if model.selected == nil {
                ProgressView().tint(Theme.note)
                    .frame(maxWidth: .infinity, minHeight: 240)
                    .accessibilityLabel("Loading your money")
            } else {
                // Bills and income aren't month-scoped, so a month picker there would do nothing.
                if segment != .bills {
                    MoneyMonthMenu(model: model, canExport: overview?.report != nil, exporting: exporting) {
                        Task { await export() }
                    }
                }
                Picker("Section", selection: $segment) {
                    ForEach(Segment.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.bottom, 4)
                switch segment {
                case .overview:
                    if let overview {
                        OverviewView(model: overview, addStatement: { addingStatement = true },
                                     openStatement: { openedStatement = $0 })
                    }
                case .transactions:
                    if let transactions { TransactionsView(model: transactions) }
                case .bills:
                    BillsView(model: bills, income: income)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 24)
        // The floating button sits over the end of the Overview.
        .padding(.bottom, segment == .overview ? 96 : 32)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var addStatementButton: some View {
        Button { addingStatement = true } label: {
            Label("Add statement", systemImage: "plus")
                .font(.sans(15, weight: .semibold, relativeTo: .callout))
                .foregroundStyle(Theme.onNote)
                .padding(.horizontal, 18)
                .frame(minHeight: 48)
                .background(Theme.note, in: Capsule())
                .shadow(color: .black.opacity(0.18), radius: 6, y: 2)
        }
        .buttonStyle(.plain)
        .padding(.trailing, 20)
        .padding(.bottom, 16)
    }

    private var title: some View {
        Text("Money")
            .font(.serif(28, relativeTo: .largeTitle))
            .foregroundStyle(Theme.ink)
            .accessibilityAddTraits(.isHeader)
    }

    private var statementsLink: some View {
        Button { showingStatements = true } label: {
            HStack(spacing: 4) {
                Text("Statements")
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).accessibilityHidden(true)
            }
            .font(.sans(15, weight: .semibold, relativeTo: .callout))
            .foregroundStyle(Theme.note)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Upload, review and retry bank statements")
    }

    private var categoriesLink: some View {
        Button { showingCategories = true } label: {
            HStack(spacing: 4) {
                Text("Categories")
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).accessibilityHidden(true)
            }
            .font(.sans(15, weight: .semibold, relativeTo: .callout))
            .foregroundStyle(Theme.note)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Add, rename or delete categories")
    }

    /// Category names (and what they count towards) may have changed: reload every list that shows them.
    private func reloadAfterCategoryChange() async {
        categoriesChanged = false
        async let overviewLoaded: Void = overview?.load() ?? ()
        async let listLoaded: Void = transactions?.load() ?? ()
        async let billsLoaded: Void = bills.load()
        async let incomeLoaded: Void = income.load()
        _ = await (overviewLoaded, listLoaded, billsLoaded, incomeLoaded)
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
        let next = OverviewModel(api: api, month: month, poller: poller)
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
