import SpendozaKit
import SwiftUI

/// The Health tab: the score first, then what changed by part, then one suggestion.
struct HealthView: View {
    @State private var model: HealthModel
    let api: any SpendozaAPI
    @State private var addingStatement = false

    init(api: any SpendozaAPI, cache: ReportCache, snapshots: SnapshotStore, scope: AccountScope,
         onSessionEnded: @escaping @MainActor () -> Void) {
        self.api = api
        let model = HealthModel(api: api, cache: cache, scope: scope, sync: WidgetSync(snapshots: snapshots))
        model.onSessionEnded = onSessionEnded
        _model = State(initialValue: model)
    }

    /// For previews and render checks: a model already in a state.
    init(model: HealthModel, api: any SpendozaAPI) {
        self.api = api
        _model = State(initialValue: model)
    }

    var body: some View {
        NavigationStack {
            ScrollView { page }
                .refreshable { await model.load(now: AppClock.now) }
                .background(Theme.paper.ignoresSafeArea())
                // The title only labels the back button on the screens pushed from here.
                .navigationTitle("Health")
                .toolbar(.hidden, for: .navigationBar)
        }
        // Reload unless there's something on screen: a load that was cancelled leaves the state as it was.
        .task { if !model.isLoaded { await model.load(now: AppClock.now) } }
        // No cancelling on disappear: switching tabs must not drop a month the person just picked (9.47).
        .fullScreenCover(isPresented: $addingStatement) {
            OnboardingView(api: api, mode: .addStatement) {
                addingStatement = false
                Task { await model.load(now: AppClock.now) }
            }
        }
    }

    /// The scrolling content (also what render checks draw, since ImageRenderer skips ScrollView).
    var page: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Your money's health")
                .font(.serif(28, relativeTo: .largeTitle))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            content
        }
        .padding(.horizontal, 20)
        .padding(.top, 24)
        .padding(.bottom, 32)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            ProgressView().tint(Theme.note)
                .frame(maxWidth: .infinity, minHeight: 240)
                .accessibilityLabel("Loading your check-up")
        case .empty(let returning):
            emptyState(returning: returning)
        case .inProgress(let soFar):
            inProgress(soFar)
        case .failed(let message):
            VStack(alignment: .leading, spacing: 16) {
                InlineError(message: message).padding(.top, 16)
                Button("Try again") { Task { await model.load(now: AppClock.now) } }
                    .buttonStyle(SecondaryButtonStyle())
            }
        case .loaded(let snapshot):
            loaded(snapshot)
        }
    }

    // MARK: Empty

    /// The empty state's line and button; someone with statements isn't asked for their first (9.42).
    static func emptyText(returning: Bool) -> (message: String, button: String) {
        returning
            ? ("There's no check-up for the last six months. Add a recent statement to see one.", "Add a statement")
            : ("Your check-up will appear here once we've read a statement.", "Add your first statement")
    }

    /// "Your first check-up arrives when November ends."
    static func firstCheckupText(soFar month: Month) -> String {
        "Your first check-up arrives when \(month.name) ends."
    }

    private func emptyState(returning: Bool) -> some View {
        let text = Self.emptyText(returning: returning)
        return VStack(alignment: .leading, spacing: 16) {
            Text(text.message)
                .font(.sans(15, relativeTo: .subheadline))
                .foregroundStyle(Theme.soft)
                .padding(.top, 8)
            Button(text.button) { addingStatement = true }
                .buttonStyle(PrimaryButtonStyle())
        }
    }

    /// Only the month in progress has a report (R42): no check-up yet, but where the month stands.
    private func inProgress(_ soFar: Report) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(Self.firstCheckupText(soFar: soFar.month))
                .font(.sans(15, relativeTo: .subheadline))
                .foregroundStyle(Theme.soft)
                .padding(.top, 8)
                .padding(.bottom, 16)
            NavigationLink { SoFarView(report: soFar) } label: { soFarRow(soFar) }
                .buttonStyle(.plain)
                .topRule()
        }
    }

    // MARK: Loaded

    @ViewBuilder private func loaded(_ snapshot: HealthSnapshot) -> some View {
        monthMenu(snapshot)
        if let health = snapshot.report.data.health {
            EngravedDial(score: health.score, previousScore: health.previousScore, size: .large,
                         month: snapshot.report.month)
                .frame(maxWidth: 240)
                .frame(maxWidth: .infinity)
                .padding(.top, 8)
            if let line = snapshot.bandLine {
                Text("\(Text(line.band).font(.sans(15, weight: .semibold, relativeTo: .subheadline)).foregroundColor(Self.bandTextColor(health.score)))\(Text(line.rest).foregroundColor(Theme.ink))")
                    .font(.sans(15, relativeTo: .subheadline))
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
                    .padding(.top, 2)
                    .padding(.bottom, 14)
                    .accessibilityHidden(true)
            }
            VStack(spacing: 0) {
                ForEach(snapshot.parts, id: \.part) { change in
                    NavigationLink {
                        PartDetailView(part: change.part, snapshot: snapshot, api: api)
                    } label: {
                        PartRow(change: change, highlighted: change.part == Self.mostLost(snapshot.parts))
                    }
                    .buttonStyle(.plain)
                }
            }
            .topRule()
        } else {
            Text("There's no score for \(snapshot.report.month.name) yet.")
                .font(.sans(15, relativeTo: .subheadline))
                .foregroundStyle(Theme.soft)
                .padding(.top, 16)
        }

        if let soFar = snapshot.soFar {
            NavigationLink { SoFarView(report: soFar) } label: { soFarRow(soFar) }
                .buttonStyle(.plain)
        }

        if let suggestion = snapshot.suggestion {
            SuggestionPanel {
                VStack(alignment: .leading, spacing: 2) {
                    Text(suggestion.title).font(.serif(16, relativeTo: .headline))
                    Text(suggestion.detail)
                }
            }
            .padding(.top, 20)
        }

        if snapshot.isCached {
            Text(Self.updatedText(snapshot.updatedAt, calendar: .current))
                .font(.sans(13, relativeTo: .footnote))
                .foregroundStyle(Theme.soft)
                .frame(maxWidth: .infinity)
                .padding(.top, 16)
        }
    }

    @ViewBuilder private func monthMenu(_ snapshot: HealthSnapshot) -> some View {
        let label = "\(snapshot.report.month.name) check-up"
        if model.checkupChoices.count > 1 {
            Menu {
                ForEach(model.checkupChoices, id: \.self) { month in
                    Button {
                        model.requestSelect(month)
                    } label: {
                        if month == model.selectedMonth { Label("\(month.name) check-up", systemImage: "checkmark") }
                        else { Text("\(month.name) check-up") }
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(label)
                    Image(systemName: "chevron.down").font(.system(size: 11, weight: .semibold))
                }
                .font(.sans(14, relativeTo: .subheadline))
                .foregroundStyle(Theme.note)
                .frame(minHeight: 44, alignment: .leading)
            }
            .accessibilityLabel(label)
            .accessibilityHint("Choose another month")
        } else {
            Text(label)
                .font(.sans(14, relativeTo: .subheadline))
                .foregroundStyle(Theme.soft)
                .frame(minHeight: 44, alignment: .leading)
        }
    }

    private func soFarRow(_ report: Report) -> some View {
        RuledRow {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(report.month.name) so far")
                        .font(.sans(15, relativeTo: .body))
                        .foregroundStyle(Theme.ink)
                    Text("Not final until the month ends")
                        .font(.sans(12, relativeTo: .caption))
                        .foregroundStyle(Theme.soft)
                }
                Spacer(minLength: 12)
                if let health = report.data.health {
                    HStack(alignment: .firstTextBaseline, spacing: 0) {
                        Text("\(health.score)").font(.serif(17, relativeTo: .body))
                        Text("/100").font(.sans(14, relativeTo: .body))
                    }
                    .foregroundStyle(Theme.ink)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.soft)
                    .accessibilityHidden(true)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(soFarAccessibility(report))
    }

    private func soFarAccessibility(_ report: Report) -> String {
        let base = "\(report.month.name) so far"
        guard let health = report.data.health else { return base }
        return "\(base), \(health.score) of 100, not final until the month ends"
    }

    // MARK: Helpers

    /// Amber is graphics-only at small sizes; Fair text uses the darker amber.
    static func bandTextColor(_ score: Int) -> Color {
        switch ScoreBand(score: score) {
        case .low: Theme.oxblood
        case .fair: Theme.amberText
        case .good: Theme.note
        }
    }

    /// The part that lost the most points, for the faint highlight; nil when nothing dropped.
    static func mostLost(_ parts: [PartChange]) -> ScorePart? {
        parts.filter { ($0.delta ?? 0) < 0 }.min { ($0.delta ?? 0) < ($1.delta ?? 0) }?.part
    }

    /// "Last updated Oct 26"
    static func updatedText(_ date: Date, calendar: Calendar) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "MMM d"
        return "Last updated \(formatter.string(from: date))"
    }
}
