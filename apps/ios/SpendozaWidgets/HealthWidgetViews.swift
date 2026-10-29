import SpendozaKit
import SwiftUI
import WidgetKit

#if WIDGET_VIEWS_IN_APP_TESTS
@testable import Spendoza  // the unit tests compile this file too, against the app's theme
#endif

/// Shown when the app has not saved a score yet (or after sign-out).
let healthWidgetEmptyText = "Open Spendoza to see your score"

/// Picks the layout for the widget family. Everything here comes from `WidgetSnapshot`:
/// score, band, previous score and month. There are no amounts anywhere to show.
struct HealthWidgetEntryView: View {
    let snapshot: WidgetSnapshot?
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryCircular:
            HealthCircularView(snapshot: snapshot)
                .containerBackground(for: .widget) { AccessoryWidgetBackground() }
        default:
            HealthSmallView(snapshot: snapshot)
                .containerBackground(Theme.paper, for: .widget)
        }
    }
}

struct HealthSmallView: View {
    let snapshot: WidgetSnapshot?

    var body: some View {
        if let snapshot {
            VStack(spacing: 6) {
                EngravedDial(score: snapshot.score, previousScore: snapshot.previousScore,
                             size: .widget, month: snapshot.month)
                VStack(spacing: 1) {
                    Text(snapshot.summaryLine)
                        .font(.sans(12, weight: .semibold, relativeTo: .caption))
                        .foregroundStyle(snapshot.band.color)
                    Text("\(snapshot.month.name) check-up")
                        .font(.sans(11, relativeTo: .caption2))
                        .foregroundStyle(Theme.soft)
                }
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .accessibilityHidden(true)
            }
        } else {
            Text(healthWidgetEmptyText)
                .font(.serif(15, relativeTo: .body))
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

struct HealthCircularView: View {
    let snapshot: WidgetSnapshot?

    var body: some View {
        if let snapshot {
            Gauge(value: Double(min(max(snapshot.score, 0), 100)), in: 0...100) {
                Text("Health")
            } currentValueLabel: {
                Text("\(snapshot.score)")
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .accessibilityLabel(dialAccessibilityLabel(score: snapshot.score, previous: snapshot.previousScore,
                                                       month: snapshot.month))
        } else {
            Image(systemName: "gauge.with.dots.needle.33percent")
                .accessibilityLabel(healthWidgetEmptyText)
        }
    }
}
