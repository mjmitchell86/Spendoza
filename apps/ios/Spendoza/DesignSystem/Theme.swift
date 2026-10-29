import SwiftUI
import UIKit

/// An sRGB colour in 0...1 components, used for the palette and contrast maths.
struct RGB: Equatable, Sendable {
    let r: Double
    let g: Double
    let b: Double

    init(hex: UInt32) {
        r = Double((hex >> 16) & 0xFF) / 255
        g = Double((hex >> 8) & 0xFF) / 255
        b = Double(hex & 0xFF) / 255
    }

    /// WCAG relative luminance.
    var luminance: Double {
        func linear(_ c: Double) -> Double { c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
    }
}

/// The "Banknote" palette. Light values are the spec's; dark values are tuned so every text pairing keeps WCAG AA.
enum Theme {
    struct Pair: Sendable {
        let light: RGB
        let dark: RGB

        init(light: UInt32, dark: UInt32) {
            self.light = RGB(hex: light)
            self.dark = RGB(hex: dark)
        }

        func rgb(dark isDark: Bool) -> RGB { isDark ? dark : light }

        var color: Color {
            let light = self.light, dark = self.dark
            return Color(uiColor: UIColor { traits in
                let c = traits.userInterfaceStyle == .dark ? dark : light
                return UIColor(red: c.r, green: c.g, blue: c.b, alpha: 1)
            })
        }
    }

    enum Palette {
        static let paper = Pair(light: 0xE9EEE6, dark: 0x13241D)
        static let card = Pair(light: 0xF4F7F2, dark: 0x1A2E26)
        static let note = Pair(light: 0x1E4A3B, dark: 0x7FB89C)
        /// Text on a `note` surface: the card colour in light mode, the dark paper in dark mode.
        static let onNote = Pair(light: 0xF4F7F2, dark: 0x13241D)
        static let ink = Pair(light: 0x1A2620, dark: 0xE8EFE9)
        static let soft = Pair(light: 0x4A5A52, dark: 0xA9BDB2)
        static let engraving = Pair(light: 0x9DB3A6, dark: 0x3E5A4D)
        /// Graphics and large text only: below 4.5:1 on paper in light mode.
        static let amber = Pair(light: 0xA8701A, dark: 0xD6A04A)
        /// Small amber text.
        static let amberText = Pair(light: 0x7A5010, dark: 0xD6A04A)
        static let oxblood = Pair(light: 0x8E2B2B, dark: 0xEE9088)
    }

    static let paper = Palette.paper.color
    static let card = Palette.card.color
    static let note = Palette.note.color
    static let onNote = Palette.onNote.color
    static let ink = Palette.ink.color
    static let soft = Palette.soft.color
    static let engraving = Palette.engraving.color
    static let amber = Palette.amber.color
    static let amberText = Palette.amberText.color
    static let oxblood = Palette.oxblood.color

    /// Panel and button corner radius.
    static let corner: CGFloat = 4
    /// Hairline rule thickness.
    static let hairline: CGFloat = 1

    /// WCAG 2 contrast ratio, 1...21.
    static func contrastRatio(_ a: RGB, _ b: RGB) -> Double {
        let (hi, lo) = (max(a.luminance, b.luminance), min(a.luminance, b.luminance))
        return (hi + 0.05) / (lo + 0.05)
    }
}
