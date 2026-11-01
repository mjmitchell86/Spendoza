import Foundation

/// Household invite and invitation codes. Same rules as the shared TypeScript helpers (`household-code.ts`).
/// (`InviteCode` is the sign-up invite-code model.)
public enum HouseholdCode {
    /// Removes whitespace and hyphens anywhere and lowercases: what the server matches on.
    public static func normalize(_ input: String) -> String {
        String(String.UnicodeScalarView(input.unicodeScalars.filter { $0 != "-" && !$0.properties.isWhitespace })).lowercased()
    }

    /// Uppercase for display; a 10-character code gets a hyphen after the fifth ("ABCDE-FGHJK").
    public static func format(_ code: String) -> String {
        let upper = code.uppercased()
        guard upper.count == 10 else { return upper }
        return "\(upper.prefix(5))-\(upper.suffix(5))"
    }
}
