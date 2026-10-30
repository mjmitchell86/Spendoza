import SpendozaKit
import SwiftUI
import Testing
import UIKit
@testable import Spendoza

/// Renders the widget views to PNGs when RENDER_WIDGETS_DIR is set (otherwise it only checks they build an image).
@MainActor
struct WidgetRenderTests {
    private let snapshot = WidgetSnapshot(score: 64, band: .fair, previousScore: 73, month: Month(year: 2026, month: 10))

    @Test func emptyAndFilledViewsRender() throws {
        let dir = ProcessInfo.processInfo.environment["RENDER_WIDGETS_DIR"]
        for (name, snap) in [("snapshot", Optional(snapshot)), ("empty", nil)] {
            for scheme in [ColorScheme.light, .dark] {
                let tag = scheme == .dark ? "dark" : "light"
                try render(HealthSmallView(snapshot: snap).padding(16).frame(width: 170, height: 170)
                    .background(Theme.paper), scheme: scheme, to: dir, name: "small-\(name)-\(tag)")
                try render(HealthCircularView(snapshot: snap).frame(width: 76, height: 76)
                    .background(Color.gray.opacity(0.25)).clipShape(Circle()),
                    scheme: scheme, to: dir, name: "circular-\(name)-\(tag)")
            }
        }
    }

    private func render(_ view: some View, scheme: ColorScheme, to dir: String?, name: String) throws {
        let renderer = ImageRenderer(content: view.environment(\.colorScheme, scheme))
        renderer.scale = 3
        let image = try #require(renderer.uiImage)
        guard let dir else { return }
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        try #require(image.pngData()).write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
    }
}
