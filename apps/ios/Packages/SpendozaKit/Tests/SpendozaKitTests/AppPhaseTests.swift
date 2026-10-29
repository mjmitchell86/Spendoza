import Foundation
import Testing
@testable import SpendozaKit

@Suite struct AppPhaseTests {
    private func profile(onboarded: Bool, admin: Bool = false) -> Profile {
        Profile(id: "u1", displayName: "Sam", onboardingCompleted: onboarded, isAdmin: admin,
                emailReportsEnabled: true, householdID: nil)
    }

    @Test func noSessionIsSignedOut() {
        #expect(appPhase(session: false, profile: nil) == .signedOut)
        #expect(appPhase(session: false, profile: profile(onboarded: true)) == .signedOut)
    }

    @Test func sessionWithoutProfileYetIsOnboarding() {
        #expect(appPhase(session: true, profile: nil) == .onboarding)
    }

    @Test func unfinishedOnboardingIsOnboarding() {
        #expect(appPhase(session: true, profile: profile(onboarded: false, admin: true)) == .onboarding)
    }

    @Test func completedOnboardingIsReadyCarryingAdminFlag() {
        #expect(appPhase(session: true, profile: profile(onboarded: true)) == .ready(isAdmin: false))
        #expect(appPhase(session: true, profile: profile(onboarded: true, admin: true)) == .ready(isAdmin: true))
    }
}

@Suite struct SupabaseConfigTests {
    @Test func blankValuesAreNotConfigured() {
        #expect(SupabaseConfig(urlString: "", anonKey: "") == nil)
        #expect(SupabaseConfig(urlString: "https://x.supabase.co", anonKey: "") == nil)
        #expect(SupabaseConfig(urlString: "", anonKey: "key") == nil)
        #expect(SupabaseConfig(urlString: nil, anonKey: nil) == nil)
    }

    @Test func unexpandedBuildSettingsAreNotConfigured() {
        #expect(SupabaseConfig(urlString: "$(SUPABASE_URL)", anonKey: "$(SUPABASE_ANON_KEY)") == nil)
    }

    @Test func invalidURLsAreNotConfigured() {
        #expect(SupabaseConfig(urlString: "not a url", anonKey: "key") == nil)
        #expect(SupabaseConfig(urlString: "ftp://x.supabase.co", anonKey: "key") == nil)
        #expect(SupabaseConfig(urlString: "https:", anonKey: "key") == nil)
    }

    @Test func validValuesAreConfigured() throws {
        let config = try #require(SupabaseConfig(urlString: " https://x.supabase.co ", anonKey: " key "))
        #expect(config.url == URL(string: "https://x.supabase.co"))
        #expect(config.anonKey == "key")
    }
}
