import SpendozaKit
import SwiftUI

@main
struct SpendozaApp: App {
    @State private var store = SpendozaApp.makeStore()
    @State private var lock = AppLock(authenticator: DeviceAuthenticator())
    @AppStorage(Appearance.defaultsKey) private var appearance: Appearance = .system

    var body: some Scene {
        WindowGroup {
            RootView(store: store, lock: lock)
                .preferredColorScheme(appearance.colorScheme)
        }
    }

    private static func makeStore() -> SessionStore {
        let base = (Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String).flatMap(URL.init(string:))
        return SessionStore(config: SupabaseConfig(bundle: .main),
                            apiBaseURL: base ?? URL(string: "https://api.spendoza.io")!)
    }
}

private extension Appearance {
    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}
