import Testing
import UIKit
@testable import Spendoza

struct ThemeContrastTests {
    private typealias Pairing = (name: String, fg: Theme.Pair, bg: Theme.Pair)

    /// Every text-on-surface pairing the app uses.
    private let textPairings: [Pairing] = [
        ("ink on paper", Theme.Palette.ink, Theme.Palette.paper),
        ("soft on paper", Theme.Palette.soft, Theme.Palette.paper),
        ("ink on card", Theme.Palette.ink, Theme.Palette.card),
        ("soft on card", Theme.Palette.soft, Theme.Palette.card),
        ("amberText on paper", Theme.Palette.amberText, Theme.Palette.paper),
        ("amberText on card", Theme.Palette.amberText, Theme.Palette.card),
        ("oxblood on paper", Theme.Palette.oxblood, Theme.Palette.paper),
        ("oxblood on card", Theme.Palette.oxblood, Theme.Palette.card),
        ("note on paper", Theme.Palette.note, Theme.Palette.paper),
        ("note on card", Theme.Palette.note, Theme.Palette.card),
        ("text on the note panel", Theme.Palette.onNote, Theme.Palette.note),
    ]

    @Test func everyTextPairingMeetsAA() {
        for pairing in textPairings {
            for dark in [false, true] {
                let ratio = Theme.contrastRatio(pairing.fg.rgb(dark: dark), pairing.bg.rgb(dark: dark))
                #expect(ratio >= 4.5, "\(pairing.name) (\(dark ? "dark" : "light")) is \(ratio):1")
            }
        }
    }

    @Test func lightTextOnNoteIsTheCardColor() {
        #expect(Theme.Palette.onNote.light == RGB(hex: 0xF4F7F2))
    }

    @Test func plainAmberFailsOnPaperInLightMode() {
        // Why `amberText` exists: amber is for graphics and large text only.
        #expect(Theme.contrastRatio(Theme.Palette.amber.light, Theme.Palette.paper.light) < 4.5)
    }

    @Test func contrastRatioMatchesKnownValues() {
        #expect(abs(Theme.contrastRatio(RGB(hex: 0x000000), RGB(hex: 0xFFFFFF)) - 21) < 0.01)
        #expect(abs(Theme.contrastRatio(RGB(hex: 0xFFFFFF), RGB(hex: 0xFFFFFF)) - 1) < 0.01)
    }

    @Test func bundledFontsAreRegistered() {
        for name in FontName.all {
            #expect(UIFont(name: name, size: 12) != nil, "\(name) is not registered in Info.plist")
        }
    }

    @Test func semiboldIsHeavierThanRegular() {
        func width(_ name: String) -> CGFloat {
            guard let font = UIFont(name: name, size: 40) else { return 0 }
            return ("Hamburgefonstiv" as NSString).size(withAttributes: [.font: font]).width
        }
        #expect(width(FontName.sansSemiBold) > width(FontName.sansRegular))
        #expect(width(FontName.serifSemiBold) > width(FontName.serifRegular))
    }
}
