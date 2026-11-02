import Foundation

/// Typed money amounts, read and shown with a locale's separators ("12,50" in Germany, "12.50" in the US).
/// Shared by the bill form and the income form.
enum AmountText {
    /// The number typed, or nil when it can't be read with certainty: a decimal separator at most once, and the
    /// locale's grouping separator only between proper groups of three digits ("1,234.50" in en_US, "1.234,50" in de_DE).
    /// "12,50" in en_US is rejected rather than read as 1250. Negative and non-numeric text is rejected.
    static func parse(_ text: String, locale: Locale) -> Double? {
        let decimal = locale.decimalSeparator ?? "."
        let grouping = locale.groupingSeparator ?? ","
        // Spaces never carry meaning (some locales group with one).
        // Native digits ("١٢٫٥٠" in Arabic locales, which is also how `format` writes them) read as ASCII ones.
        let cleaned = String(text.filter { !$0.isWhitespace }.map(asciiDigit))
        guard !cleaned.isEmpty else { return nil }
        let halves = cleaned.components(separatedBy: decimal)
        guard halves.count <= 2 else { return nil }
        let fraction = halves.count == 2 ? halves[1] : nil
        if let fraction, !isDigits(fraction, allowEmpty: true) { return nil }
        var whole = halves[0]
        if grouping != decimal, !grouping.trimmingCharacters(in: .whitespaces).isEmpty, whole.contains(grouping) {
            let groups = whole.components(separatedBy: grouping)
            guard (1...3).contains(groups[0].count), groups.dropFirst().allSatisfy({ $0.count == 3 }) else { return nil }
            whole = groups.joined()
        }
        guard isDigits(whole, allowEmpty: fraction?.isEmpty == false) else { return nil }
        if whole.isEmpty && fraction == nil { return nil }
        // A very long run of digits reads as infinity, which passes "above zero".
        guard let value = Double("\(whole.isEmpty ? "0" : whole).\(fraction.flatMap { $0.isEmpty ? nil : $0 } ?? "0")"),
              value.isFinite else { return nil }
        return value
    }

    /// "15.49" or "15,49": up to two decimals, no grouping, so it reads back with `parse` (native digits included).
    static func format(_ value: Double, locale: Locale) -> String {
        value.formatted(.number.precision(.fractionLength(0...2)).grouping(.never).locale(locale))
    }

    /// The ASCII digit for any decimal digit character; other characters unchanged.
    private static func asciiDigit(_ character: Character) -> Character {
        guard !character.isASCII, character.isNumber, let value = character.wholeNumberValue, (0...9).contains(value),
              let scalar = Unicode.Scalar(UInt32(48 + value)) else { return character }
        return Character(scalar)
    }

    private static func isDigits(_ text: String, allowEmpty: Bool) -> Bool {
        text.isEmpty ? allowEmpty : text.allSatisfy { $0.isASCII && $0.isNumber }
    }
}
