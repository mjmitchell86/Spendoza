import SwiftUI

/// A list row separated by a hairline `engraving` rule. Stack rows in a `VStack(spacing: 0)` and add `.topRule()` to the stack.
struct RuledRow<Content: View>: View {
    var highlighted = false
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(.vertical, 10)
            .padding(.horizontal, 2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                if highlighted {
                    LinearGradient(
                        colors: [Theme.amber.opacity(0.12), .clear],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                }
            }
            .overlay(alignment: .bottom) { HairlineRule() }
    }
}

struct HairlineRule: View {
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        Theme.engraving.frame(height: Theme.hairline(displayScale: displayScale))
    }
}

/// A rounded-rectangle border one device pixel wide.
private struct HairlineBorder: ViewModifier {
    let color: Color
    let dash: [CGFloat]
    @Environment(\.displayScale) private var displayScale

    func body(content: Content) -> some View {
        content.overlay(
            RoundedRectangle(cornerRadius: Theme.corner)
                .strokeBorder(color, style: StrokeStyle(lineWidth: Theme.hairline(displayScale: displayScale), dash: dash))
        )
    }
}

extension View {
    /// The hairline above the first row of a ruled list.
    func topRule() -> some View {
        overlay(alignment: .top) { HairlineRule() }
    }

    /// A hairline border on the panel/button corner radius.
    func hairlineBorder(_ color: Color, dash: [CGFloat] = []) -> some View {
        modifier(HairlineBorder(color: color, dash: dash))
    }
}

/// The one filled note-green panel per screen, reserved for the main suggestion.
struct SuggestionPanel<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .foregroundStyle(Theme.onNote)
            .font(.sans(15, relativeTo: .subheadline))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Theme.note, in: RoundedRectangle(cornerRadius: Theme.corner))
    }
}

/// A secondary explanation: `card` fill with an `engraving` hairline border.
struct OutlinedPanel<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .foregroundStyle(Theme.ink)
            .font(.sans(15, relativeTo: .subheadline))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
            .hairlineBorder(Theme.engraving)
    }
}

/// Filled note-green button.
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.sans(15, weight: .semibold, relativeTo: .callout))
            .foregroundStyle(Theme.onNote)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(Theme.note, in: RoundedRectangle(cornerRadius: Theme.corner))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

/// Outlined note-green button.
struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.sans(15, weight: .semibold, relativeTo: .callout))
            .foregroundStyle(Theme.note)
            .frame(maxWidth: .infinity, minHeight: 44)
            .hairlineBorder(Theme.note)
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// Monthly history bars drawn with an engraved diagonal hatch; the highlighted bar (the current month) is solid amber.
/// A month with no value (no report) is a gap: a dashed outline, so it never reads as a $0 month.
struct EngravedBars: View {
    enum Slot: Equatable {
        case gap
        /// Height as a fraction of the full bar, 0...1.
        case bar(Double)
    }

    /// What each value is drawn as; heights are relative to `ceiling`, else to the largest value.
    nonisolated static func slots(values: [Double?], ceiling: Double?) -> [Slot] {
        let peak = max(ceiling ?? values.compactMap { $0 }.max() ?? 0, .leastNonzeroMagnitude)
        return values.map { value in
            guard let value else { return .gap }
            return .bar(min(max(value, 0) / peak, 1))
        }
    }

    /// Bar values, oldest first; nil for a month with no report.
    let values: [Double?]
    /// Index drawn solid amber; defaults to the last bar.
    var highlightedIndex: Int?
    var height: CGFloat = 64
    /// The value a full-height bar stands for; defaults to the largest value.
    var ceiling: Double?

    var body: some View {
        let highlighted = highlightedIndex ?? values.count - 1
        HStack(alignment: .bottom, spacing: 6) {
            ForEach(Array(Self.slots(values: values, ceiling: ceiling).enumerated()), id: \.offset) { index, slot in
                switch slot {
                case .gap:
                    RoundedRectangle(cornerRadius: 2)
                        .strokeBorder(Theme.engraving, style: StrokeStyle(lineWidth: 1, dash: [2, 2]))
                        .frame(height: height * 0.3)
                case .bar(let fraction):
                    Group {
                        if index == highlighted {
                            Theme.amber
                        } else {
                            HatchFill()
                        }
                    }
                    .frame(height: height * CGFloat(fraction))
                    .clipShape(UnevenRoundedRectangle(topLeadingRadius: 2, topTrailingRadius: 2))
                }
            }
        }
        .frame(height: height, alignment: .bottom)
        .padding(.horizontal, 2)
        .overlay(alignment: .bottom) { HairlineRule() }
        .accessibilityHidden(true)
    }
}

/// 135-degree hatch: 1 pt `note` lines at 55% over an 18% `note` wash, repeating every 3 pt.
private struct HatchFill: View {
    var body: some View {
        Canvas { context, size in
            let line = Theme.note.opacity(0.55)
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Theme.note.opacity(0.18)))
            var path = Path()
            var x = -size.height
            while x < size.width {
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x + size.height, y: size.height))
                x += 3
            }
            context.stroke(path, with: .color(line), lineWidth: 1)
        }
    }
}
