import SpendozaKit
import SwiftUI
import WidgetKit

/// The timeline holds one entry. The app reloads timelines whenever the snapshot changes
/// (a new check-up, a sign-out), so the widget never needs to poll.
struct HealthEntry: TimelineEntry {
    let date: Date
    /// Score, band, previous score and month only. Never amounts.
    let snapshot: WidgetSnapshot?
}

struct HealthProvider: TimelineProvider {
    private static let appGroup = "group.com.gravitaz.spendoza"

    private func current() -> WidgetSnapshot? { SnapshotStore(appGroup: Self.appGroup).load() }

    func placeholder(in context: Context) -> HealthEntry {
        HealthEntry(date: .now, snapshot: WidgetSnapshot(score: 64, band: .fair, previousScore: 73,
                                                         month: Month(year: 2026, month: 10)))
    }

    func getSnapshot(in context: Context, completion: @escaping (HealthEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : HealthEntry(date: .now, snapshot: current()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HealthEntry>) -> Void) {
        completion(Timeline(entries: [HealthEntry(date: .now, snapshot: current())], policy: .never))
    }
}

struct HealthWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HealthWidget", provider: HealthProvider()) { entry in
            HealthWidgetEntryView(snapshot: entry.snapshot)
        }
        .configurationDisplayName("Health score")
        .description("Your latest check-up score. No amounts are shown.")
        .supportedFamilies([.systemSmall, .accessoryCircular])
    }
}
