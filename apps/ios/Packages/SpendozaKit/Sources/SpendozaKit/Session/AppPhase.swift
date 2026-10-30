import Foundation

/// Which part of the app to show.
public enum AppPhase: Equatable, Sendable {
    case signedOut
    case onboarding
    case ready(isAdmin: Bool)
}

/// `session` is whether a Supabase session exists. A session whose profile hasn't been created or finished onboarding is `.onboarding`.
public func appPhase(session: Bool, profile: Profile?) -> AppPhase {
    guard session else { return .signedOut }
    guard let profile, profile.onboardingCompleted else { return .onboarding }
    return .ready(isAdmin: profile.isAdmin)
}

/// Supabase project settings from the build's Info.plist. `nil` from `init` means this build isn't configured to sign in
/// (local builds have blank values, and an unexpanded `$(…)` placeholder counts as blank).
public struct SupabaseConfig: Equatable, Sendable {
    public let url: URL
    public let anonKey: String

    public init?(urlString: String?, anonKey: String?) {
        let urlText = urlString?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let key = anonKey?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !urlText.isEmpty, !key.isEmpty, !urlText.contains("$("), !key.contains("$("),
              let url = URL(string: urlText),
              let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let host = url.host, !host.isEmpty
        else { return nil }
        self.url = url
        self.anonKey = key
    }

    /// Reads `SupabaseURL` and `SupabaseAnonKey` from a bundle's Info.plist.
    public init?(bundle: Bundle) {
        self.init(urlString: bundle.object(forInfoDictionaryKey: "SupabaseURL") as? String,
                  anonKey: bundle.object(forInfoDictionaryKey: "SupabaseAnonKey") as? String)
    }
}
