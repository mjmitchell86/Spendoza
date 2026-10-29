import SpendozaKit
import SwiftUI

@main
struct SpendozaApp: App {
    @State private var store: SessionStore
    private let checkup: CheckupRefresh
    @State private var coordinator = LockCoordinator(lock: AppLock(authenticator: DeviceAuthenticator()))
    @AppStorage(Appearance.defaultsKey) private var appearance: Appearance = .system

    init() {
        let store = Self.makeStore()
        _store = State(initialValue: store)
        let checkup = CheckupRefresh.live(store: store)
        // Background task handlers must be registered before launch finishes.
        checkup.register()
        self.checkup = checkup
    }

    var body: some Scene {
        WindowGroup {
            RootView(store: store, coordinator: coordinator, checkup: checkup)
                .preferredColorScheme(appearance.colorScheme)
        }
    }

    private static func makeStore() -> SessionStore {
        let base = (Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String).flatMap(URL.init(string:))
        let store = SessionStore(config: SupabaseConfig(bundle: .main),
                                 apiBaseURL: base ?? URL(string: "https://api.spendoza.io")!,
                                 accountScope: AppServices.accountScope, profileCache: AppServices.profileCache)
        store.onSignOut = { AppServices.clearAccountData() }
        return store
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
