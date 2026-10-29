import Foundation
import Testing

/// Minor 1: the required-reason API declarations shipped in the app and in the widget extension.
struct PrivacyManifestTests {
    private func userDefaultsReasons(in bundle: URL) throws -> Set<String> {
        let url = bundle.appendingPathComponent("PrivacyInfo.xcprivacy")
        let plist = try #require(
            try PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as? [String: Any])
        #expect(plist["NSPrivacyTracking"] as? Bool == false)
        let types = try #require(plist["NSPrivacyAccessedAPITypes"] as? [[String: Any]])
        let defaults = try #require(types.first {
            $0["NSPrivacyAccessedAPIType"] as? String == "NSPrivacyAccessedAPICategoryUserDefaults"
        })
        return Set(defaults["NSPrivacyAccessedAPITypeReasons"] as? [String] ?? [])
    }

    /// The app reads its own standard defaults (CA92.1) and the App Group's shared with the widget (1C8F.1).
    @Test func theAppDeclaresBothUserDefaultsReasons() throws {
        #expect(try userDefaultsReasons(in: Bundle.main.bundleURL) == ["CA92.1", "1C8F.1"])
    }

    /// The widget reads the App Group's defaults (1C8F.1).
    @Test func theWidgetHasItsOwnManifest() throws {
        let widget = try #require(Bundle.main.builtInPlugInsURL?.appendingPathComponent("SpendozaWidgets.appex"))
        #expect(try userDefaultsReasons(in: widget) == ["1C8F.1"])
    }
}
