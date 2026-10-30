import SpendozaKit
import SwiftUI

/// Dollar text in the app's fixed US format.
enum Money {
    private static let us = Locale(identifier: "en_US")

    /// "$448"
    static func whole(_ value: Double) -> String {
        value.formatted(.currency(code: "USD").precision(.fractionLength(0)).locale(us))
    }

    /// "$212.40"
    static func cents(_ value: Double) -> String {
        value.formatted(.currency(code: "USD").locale(us))
    }

    /// "+$310" or "−$22" (a true minus sign).
    static func signed(_ value: Double) -> String {
        let text = whole(abs(value))
        return value < 0 ? "−\(text)" : "+\(text)"
    }
}

extension Month {
    /// "Sep"
    var shortName: String { String(name.prefix(3)) }
}

/// A transaction's "2026-10-18" as "Oct 18"; anything else is returned as is.
func shortDate(_ apiDate: String) -> String {
    guard let month = Month(apiString: apiDate), let day = Int(apiDate.suffix(2)) else { return apiDate }
    return "\(month.shortName) \(day)"
}

/// Five engraved bars with month labels beneath; the last (the check-up month) is solid amber.
/// A month with no value is an empty slot, so a gap in the reports shows as a gap.
struct TrendChart: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    let months: [Month]
    let values: [Double?]
    var ceiling: Double?
    /// Spoken in place of the bars, e.g. "Wants points: June 15, July 15, …".
    let summary: String

    var body: some View {
        VStack(spacing: 6) {
            EngravedBars(values: values, highlightedIndex: months.count - 1,
                         height: 72, ceiling: ceiling)
            HStack(spacing: 2) {
                ForEach(months, id: \.self) { month in
                    // Five labels can't share a phone's width at accessibility sizes, so they shrink to initials
                    // (the chart's spoken summary carries the full month names).
                    Text(typeSize.isAccessibilitySize ? String(month.shortName.prefix(1)) : month.shortName)
                        .font(.sans(12, relativeTo: .caption))
                        .foregroundStyle(Theme.soft)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, 2)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(summary)
    }
}

/// A thin track with the value filled and the rule's line marked, labelled "0%", "30% line", "50%".
struct ScoreMeter: View {
    let meter: PartDetailModel.Meter
    @Environment(\.dynamicTypeSize) private var typeSize

    private func fraction(_ value: Double) -> CGFloat {
        CGFloat(min(max(value / meter.upperBound, 0), 1))
    }

    var body: some View {
        VStack(spacing: 4) {
            GeometryReader { proxy in
                let width = proxy.size.width
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.engraving.opacity(0.45)).frame(height: 8)
                    Capsule().fill(meter.meets ? Theme.note : Theme.amber)
                        .frame(width: width * fraction(meter.value), height: 8)
                    Theme.ink.frame(width: 2, height: 16)
                        .offset(x: width * fraction(meter.threshold) - 1)
                }
                .frame(maxHeight: .infinity)
            }
            .frame(height: 16)
            if typeSize.isAccessibilitySize {
                // The three labels can't sit side by side at this size; one wrapping line keeps them legible.
                Text("\(meter.lowLabel) · \(meter.thresholdLabel) · \(meter.upperLabel)")
                    .font(.sans(12, relativeTo: .caption))
                    .foregroundStyle(Theme.soft)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                GeometryReader { proxy in
                    let width = proxy.size.width
                    ZStack(alignment: .topLeading) {
                        Text(meter.lowLabel).frame(maxWidth: .infinity, alignment: .leading)
                        Text(meter.upperLabel).frame(maxWidth: .infinity, alignment: .trailing)
                        Text(meter.thresholdLabel)
                            .fixedSize()
                            .position(x: min(max(width * fraction(meter.threshold), 30), width - 50), y: 6.5)
                    }
                }
                .frame(height: 16)
                .font(.sans(12, relativeTo: .caption))
                .foregroundStyle(Theme.soft)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(Self.format(meter.value)) against a line at \(meter.thresholdLabel.replacingOccurrences(of: " line", with: "")), "
            + (meter.meets ? "within the rule" : "outside the rule"))
    }

    private static func format(_ value: Double) -> String {
        let rounded = (value * 10).rounded() / 10
        return rounded == rounded.rounded() ? String(Int(rounded)) : String(format: "%.1f", rounded)
    }
}
