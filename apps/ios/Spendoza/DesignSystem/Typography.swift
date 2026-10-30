import SwiftUI

/// PostScript names of the bundled fonts (named instances of the variable files registered via `UIAppFonts`).
enum FontName {
    static let serifRegular = "Newsreader16pt-Regular"
    static let serifSemiBold = "NewsreaderRoman-SemiBold"
    static let sansRegular = "PublicSansRoman-Regular"
    static let sansSemiBold = "PublicSansRoman-SemiBold"

    static let all = [serifRegular, serifSemiBold, sansRegular, sansSemiBold]
}

extension Font {
    /// Newsreader: screen titles, section titles, the score and every money amount. Semibold unless `.regular` is asked for.
    static func serif(_ size: CGFloat, weight: Font.Weight = .semibold, relativeTo style: Font.TextStyle) -> Font {
        .custom(weight == .regular ? FontName.serifRegular : FontName.serifSemiBold, size: size, relativeTo: style)
    }

    /// Public Sans: everything else. Regular or semibold (anything heavier than `.medium` maps to semibold).
    static func sans(_ size: CGFloat, weight: Font.Weight = .regular, relativeTo style: Font.TextStyle) -> Font {
        let semibold = [Font.Weight.semibold, .bold, .heavy, .black].contains(weight)
        return .custom(semibold ? FontName.sansSemiBold : FontName.sansRegular, size: size, relativeTo: style)
    }
}
