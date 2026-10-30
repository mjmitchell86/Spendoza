import SpendozaKit
import SwiftUI

/// One part of the score: name on the left, "points/max" and the change since last month on the right.
/// The screen wraps it in a link to the part's drill-down.
struct PartRow: View {
    let change: PartChange
    /// The row that moved most, given a faint amber wash.
    var highlighted = false

    /// "−6", "+4" or "±0" (a true minus sign).
    static func deltaText(_ delta: Int) -> String {
        delta < 0 ? "−\(-delta)" : delta > 0 ? "+\(delta)" : "±0"
    }

    static func accessibilityText(_ change: PartChange) -> String {
        var text = "\(change.part.title), \(change.points) of \(change.max)"
        if let delta = change.delta {
            text += delta == 0 ? ", no change" : ", \(delta < 0 ? "down" : "up") \(abs(delta))"
        }
        return text
    }

    @Environment(\.dynamicTypeSize) private var typeSize

    private var title: some View {
        Text(change.part.title)
            .font(.sans(15, relativeTo: .body))
            .foregroundStyle(Theme.ink)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var figures: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("\(change.points)")
                    .font(.serif(17, relativeTo: .body))
                    .foregroundStyle(Theme.ink)
                Text("/\(change.max)")
                    .font(.sans(14, relativeTo: .body))
                    .foregroundStyle(Theme.ink)
            }
            if let delta = change.delta {
                Text(Self.deltaText(delta))
                    .font(.sans(13, relativeTo: .footnote))
                    .foregroundStyle(delta < 0 ? Theme.oxblood : delta > 0 ? Theme.note : Theme.soft)
                    .frame(minWidth: 28, alignment: .trailing)
            }
        }
        .fixedSize()
    }

    private var chevron: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Theme.soft)
            .accessibilityHidden(true)
    }

    var body: some View {
        RuledRow(highlighted: highlighted) {
            // At accessibility sizes the name gets its own line so it never breaks mid-word.
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    title
                    HStack(alignment: .firstTextBaseline) {
                        figures
                        Spacer(minLength: 8)
                        chevron
                    }
                }
            } else {
                HStack(alignment: .firstTextBaseline) {
                    title
                    Spacer(minLength: 12)
                    figures
                    chevron
                }
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Self.accessibilityText(change))
        .accessibilityHint("Shows what moved it")
    }
}
