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
    var body: some View {
        Theme.engraving.frame(height: Theme.hairline)
    }
}

extension View {
    /// The hairline above the first row of a ruled list.
    func topRule() -> some View {
        overlay(alignment: .top) { HairlineRule() }
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
            .overlay(
                RoundedRectangle(cornerRadius: Theme.corner)
                    .strokeBorder(Theme.engraving, lineWidth: Theme.hairline)
            )
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
            .overlay(
                RoundedRectangle(cornerRadius: Theme.corner)
                    .strokeBorder(Theme.note, lineWidth: Theme.hairline)
            )
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// Monthly history bars drawn with an engraved diagonal hatch; the highlighted bar (the current month) is solid amber.
struct EngravedBars: View {
    /// Bar values, oldest first. Heights are relative to the largest value.
    let values: [Double]
    /// Index drawn solid amber; defaults to the last bar.
    var highlightedIndex: Int?
    var height: CGFloat = 64
    /// The value a full-height bar stands for; defaults to the largest value.
    var ceiling: Double?

    var body: some View {
        let peak = max(ceiling ?? values.max() ?? 0, .leastNonzeroMagnitude)
        let highlighted = highlightedIndex ?? values.count - 1
        HStack(alignment: .bottom, spacing: 6) {
            ForEach(Array(values.enumerated()), id: \.offset) { index, value in
                let barHeight = height * CGFloat(min(max(value, 0) / peak, 1))
                Group {
                    if index == highlighted {
                        Theme.amber
                    } else {
                        HatchFill()
                    }
                }
                .frame(height: barHeight)
                .clipShape(UnevenRoundedRectangle(topLeadingRadius: 2, topTrailingRadius: 2))
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
