import SpendozaKit
import SwiftUI

@main
struct SpendozaApp: App {
    @State private var store = SpendozaApp.makeStore()

    var body: some Scene {
        WindowGroup {
            RootView(store: store)
        }
    }

    private static func makeStore() -> SessionStore {
        let base = (Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String).flatMap(URL.init(string:))
        return SessionStore(config: SupabaseConfig(bundle: .main),
                            apiBaseURL: base ?? URL(string: "https://api.spendoza.io")!)
    }
}
