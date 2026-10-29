import Foundation
import SpendozaKit
import Testing

struct AppSmokeTests {
    @Test func debugBuildPointsAtTestAPI() {
        let url = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String
        #expect(url == "https://test-api.spendoza.io")
    }
}

@MainActor
struct SessionStoreSmokeTests {
    @Test func unconfiguredBuildStaysSignedOutWithoutCrashing() async throws {
        let store = SessionStore(config: SupabaseConfig(urlString: "", anonKey: ""),
                                 apiBaseURL: try #require(URL(string: "https://test-api.spendoza.io")))
        await store.restore()
        #expect(!store.isConfigured)
        #expect(store.phase == .signedOut)
        #expect(!store.isRestoring)
        await #expect(throws: APIError.message(SessionStore.notConfiguredMessage)) {
            try await store.signIn(email: "a@b.co", password: "password1")
        }
    }

    @Test func buildWithBlankSecretsIsNotConfigured() {
        // Local builds have blank Supabase values; the app must treat that as "not configured".
        if SupabaseConfig(bundle: .main) == nil {
            let store = SessionStore(config: SupabaseConfig(bundle: .main),
                                     apiBaseURL: URL(string: "https://test-api.spendoza.io")!)
            #expect(!store.isConfigured)
        }
    }
}
