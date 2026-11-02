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
        let cleaned = String(text.filter { !$0.isWhitespace })
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
        return Double("\(whole.isEmpty ? "0" : whole).\(fraction.flatMap { $0.isEmpty ? nil : $0 } ?? "0")")
    }

    /// "15.49" or "15,49": up to two decimals, no grouping, so it reads back with `parse`.
    static func format(_ value: Double, locale: Locale) -> String {
        value.formatted(.number.precision(.fractionLength(0...2)).grouping(.never).locale(locale))
    }

    private static func isDigits(_ text: String, allowEmpty: Bool) -> Bool {
        text.isEmpty ? allowEmpty : text.allSatisfy { $0.isASCII && $0.isNumber }
    }
}
