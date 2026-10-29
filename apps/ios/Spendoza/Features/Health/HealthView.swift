import SpendozaKit
import SwiftUI

/// The Health tab: the score first, then what changed by part, then one suggestion.
struct HealthView: View {
    @State private var model: HealthModel
    let api: any SpendozaAPI
    @State private var addingStatement = false

    init(api: any SpendozaAPI, cache: ReportCache, snapshots: SnapshotStore) {
        self.api = api
        _model = State(initialValue: HealthModel(api: api, cache: cache, snapshots: snapshots))
    }

    /// For previews and render checks: a model already in a state.
    init(model: HealthModel, api: any SpendozaAPI) {
        self.api = api
        _model = State(initialValue: model)
    }

    var body: some View {
        ScrollView { page }
        .refreshable { await model.load(now: .now) }
        .background(Theme.paper.ignoresSafeArea())
        .task { if case .loading = model.state { await model.load(now: .now) } }
        .fullScreenCover(isPresented: $addingStatement) {
            OnboardingView(api: api, mode: .addStatement) {
                addingStatement = false
                Task { await model.load(now: .now) }
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
        case .empty:
            emptyState
        case .failed(let message):
            VStack(alignment: .leading, spacing: 16) {
                InlineError(message: message).padding(.top, 16)
                Button("Try again") { Task { await model.load(now: .now) } }
                    .buttonStyle(SecondaryButtonStyle())
            }
        case .loaded(let snapshot):
            loaded(snapshot)
        }
    }

    // MARK: Empty

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Your check-up will appear here once we've read a statement.")
                .font(.sans(15, relativeTo: .subheadline))
                .foregroundStyle(Theme.soft)
                .padding(.top, 8)
            Button("Add your first statement") { addingStatement = true }
                .buttonStyle(PrimaryButtonStyle())
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
                    PartRow(change: change, highlighted: change.part == Self.mostLost(snapshot.parts))
                }
            }
            .topRule()
        } else {
            Text("There's no score for \(snapshot.report.month.name) yet.")
                .font(.sans(15, relativeTo: .subheadline))
                .foregroundStyle(Theme.soft)
                .padding(.top, 16)
        }

        if let soFar = snapshot.soFar { soFarRow(soFar) }

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
                        Task { await model.select(month) }
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
            }
        }
        .accessibilityElement(children: .ignore)
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
