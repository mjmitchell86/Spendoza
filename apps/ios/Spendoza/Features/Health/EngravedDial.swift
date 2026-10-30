import SpendozaKit
import SwiftUI

/// Where the dial is used: `.large` on the Health tab (with the guilloché engraving and "of 100"), `.widget` on the home screen.
enum DialSize {
    case large, widget

    /// Geometry in the dial's own coordinate space, ported from the approved mockup's SVG
    /// (`.large`: viewBox 240x156; `.widget`: viewBox 120x76).
    fileprivate struct Metrics {
        let canvas: CGSize
        let hub: CGPoint
        let radius: CGFloat
        let band: CGFloat
        let needleLength: CGFloat
        let needleWidth: CGFloat
        let hubRadius: CGFloat
        let scoreSize: CGFloat
        let scoreCenterY: CGFloat
        let ofSize: CGFloat?
        let ofCenterY: CGFloat
        let engraved: Bool
    }

    fileprivate var metrics: Metrics {
        switch self {
        case .large:
            Metrics(
                canvas: CGSize(width: 240, height: 156), hub: CGPoint(x: 120, y: 130), radius: 96, band: 7,
                needleLength: 80, needleWidth: 2.5, hubRadius: 30, scoreSize: 34, scoreCenterY: 130,
                ofSize: 9, ofCenterY: 150, engraved: true)
        case .widget:
            Metrics(
                canvas: CGSize(width: 120, height: 76), hub: CGPoint(x: 60, y: 70), radius: 50, band: 6,
                needleLength: 42, needleWidth: 2.5, hubRadius: 16, scoreSize: 18, scoreCenterY: 71,
                ofSize: nil, ofCenterY: 0, engraved: false)
        }
    }
}

/// The engraved gauge: three band arcs, guilloché engraving, an ink needle at the score,
/// a dashed needle at last month's score and the serif score at the hub.
struct EngravedDial: View {
    let score: Int
    let previousScore: Int?
    let size: DialSize
    /// The check-up month; only used for the spoken label ("... since September"). Required: it is the month the score is for, not the current one.
    let month: Month

    init(score: Int, previousScore: Int?, size: DialSize, month: Month) {
        self.score = score
        self.previousScore = previousScore
        self.size = size
        self.month = month
    }

    var body: some View {
        let m = size.metrics
        let shownScore = min(max(score, 0), 100)
        Canvas { context, canvasSize in
            let scale = canvasSize.width / m.canvas.width
            var ctx = context
            ctx.scaleBy(x: scale, y: scale)
            Self.draw(&ctx, metrics: m, score: shownScore, previous: previousScore.map { min(max($0, 0), 100) })
        }
        .aspectRatio(m.canvas.width / m.canvas.height, contentMode: .fit)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(dialAccessibilityLabel(score: score, previous: previousScore, month: month))
    }

    // MARK: Drawing

    private static func point(from hub: CGPoint, degrees: Double, length: CGFloat) -> CGPoint {
        let radians = degrees * .pi / 180
        return CGPoint(x: hub.x + length * cos(radians), y: hub.y - length * sin(radians))
    }

    private static func draw(_ ctx: inout GraphicsContext, metrics m: DialSize.Metrics, score: Int, previous: Int?) {
        if m.engraved { drawEngraving(&ctx, m) }
        drawBands(&ctx, m)

        if let previous {
            var dashed = Path()
            dashed.move(to: m.hub)
            dashed.addLine(to: point(from: m.hub, degrees: DialGeometry.angle(forScore: previous), length: m.needleLength))
            ctx.stroke(dashed, with: .color(Theme.ink.opacity(0.45)), style: StrokeStyle(lineWidth: 1, lineCap: .butt, dash: [2, 3]))
        }

        var needle = Path()
        needle.move(to: m.hub)
        needle.addLine(to: point(from: m.hub, degrees: DialGeometry.angle(forScore: score), length: m.needleLength))
        ctx.stroke(needle, with: .color(Theme.ink), style: StrokeStyle(lineWidth: m.needleWidth, lineCap: .round))

        let hubRect = CGRect(x: m.hub.x - m.hubRadius, y: m.hub.y - m.hubRadius, width: m.hubRadius * 2, height: m.hubRadius * 2)
        ctx.fill(Path(ellipseIn: hubRect), with: .color(Theme.paper))

        let scoreText = Text("\(score)")
            .font(.custom(FontName.serifSemiBold, fixedSize: score >= 100 ? m.scoreSize * 0.85 : m.scoreSize))
            .foregroundStyle(Theme.ink)
        ctx.draw(ctx.resolve(scoreText), at: CGPoint(x: m.hub.x, y: m.scoreCenterY), anchor: .center)

        if let ofSize = m.ofSize {
            let ofText = Text("of 100")
                .font(.custom(FontName.sansRegular, fixedSize: ofSize))
                .foregroundStyle(Theme.soft)
            ctx.draw(ctx.resolve(ofText), at: CGPoint(x: m.hub.x, y: m.ofCenterY), anchor: .center)
        }
    }

    private static func drawBands(_ ctx: inout GraphicsContext, _ m: DialSize.Metrics) {
        /// A hairline gap, in degrees, between neighbouring bands.
        let gap = 0.5
        let stops = DialGeometry.bandStops
        for (index, stop) in stops.enumerated() {
            var start = DialGeometry.angle(forScore: stop.1.lowerBound)
            var end = DialGeometry.angle(forScore: stop.1.upperBound + 1)
            if index > 0 { start -= gap }
            if index < stops.count - 1 { end += gap }
            var arc = Path()
            var degrees = start
            arc.move(to: point(from: m.hub, degrees: degrees, length: m.radius))
            while degrees > end {
                degrees = max(degrees - 0.5, end)
                arc.addLine(to: point(from: m.hub, degrees: degrees, length: m.radius))
            }
            ctx.stroke(arc, with: .color(stop.0.color), style: StrokeStyle(lineWidth: m.band, lineCap: .butt, lineJoin: .round))
        }
    }

    /// Twelve ellipses, 15 degrees apart, clipped to the half above the hub.
    private static func drawEngraving(_ ctx: inout GraphicsContext, _ m: DialSize.Metrics) {
        var layer = ctx
        layer.clip(to: Path(CGRect(x: 0, y: 0, width: m.canvas.width, height: m.hub.y)))
        layer.opacity = 0.5
        // One combined path stroked once, so crossings stay as light as single strokes (the mockup's group opacity).
        let ellipse = Path(ellipseIn: CGRect(x: -86, y: -38, width: 172, height: 76))
        var engraving = Path()
        for step in 0..<12 {
            let transform = CGAffineTransform(translationX: m.hub.x, y: m.hub.y).rotated(by: Double(step) * 15 * .pi / 180)
            engraving.addPath(ellipse, transform: transform)
        }
        layer.stroke(engraving, with: .color(Theme.note), lineWidth: 0.45)
    }
}

#Preview("Large, 64 (was 73)") {
    EngravedDial(score: 64, previousScore: 73, size: .large, month: Month(year: 2026, month: 10))
        .padding(40)
        .background(Theme.paper)
}

#Preview("Widget, dark, 100") {
    EngravedDial(score: 100, previousScore: nil, size: .widget, month: Month(year: 2026, month: 10))
        .frame(width: 140)
        .padding(20)
        .background(Theme.paper)
        .environment(\.colorScheme, .dark)
}
