import SpendozaKit
import SwiftUI
import Testing
@testable import Spendoza

@MainActor
struct EngravedDialTests {
    private func render(size: DialSize, score: Int, previous: Int?, dark: Bool = false) -> CGSize? {
        let view = EngravedDial(score: score, previousScore: previous, size: size, month: Month(year: 2026, month: 10))
            .frame(width: 240)
            .environment(\.colorScheme, dark ? .dark : .light)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 2
        return renderer.uiImage?.size
    }

    @Test func rendersAtBothSizesAcrossTheScale() {
        for size in [DialSize.large, .widget] {
            for (score, previous) in [(0, nil), (39, 40), (64, 73), (100, 100)] as [(Int, Int?)] {
                let rendered = render(size: size, score: score, previous: previous)
                #expect((rendered?.width ?? 0) > 0)
            }
        }
    }

    @Test func bandColoursFollowTheTheme() {
        #expect(ScoreBand.low.color == Theme.oxblood)
        #expect(ScoreBand.fair.color == Theme.amber)
        #expect(ScoreBand.good.color == Theme.note)
    }
}
