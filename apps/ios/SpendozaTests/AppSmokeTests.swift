import Foundation
import Testing

struct AppSmokeTests {
    @Test func debugBuildPointsAtTestAPI() {
        let url = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String
        #expect(url == "https://test-api.spendoza.io")
    }
}
