import SpendozaKit
import SwiftUI

@main
struct SpendozaApp: App {
    @State private var store: SessionStore
    private let checkup: CheckupRefresh
    @State private var coordinator = SpendozaApp.makeCoordinator()
    @State private var incoming = IncomingStatements()
    @AppStorage(Appearance.defaultsKey) private var appearance: Appearance = .system

    init() {
        #if DEBUG
        UITestStub.applyColorScheme()
        #endif
        OpenedFile.removeLeftovers()
        let store = Self.makeStore()
        _store = State(initialValue: store)
        let checkup = Self.makeCheckup(store: store)
        // Background task handlers must be registered before launch finishes.
        checkup.register()
        self.checkup = checkup
    }

    var body: some Scene {
        WindowGroup {
            RootView(store: store, coordinator: coordinator, checkup: checkup, incoming: incoming)
                .preferredColorScheme(appearance.colorScheme)
                // Statements opened from the share sheet or Files; other links are not handled here.
                .onOpenURL { incoming.handle($0) }
                #if DEBUG
                // `-uiTestOpenFile <path>` (with the stub API) opens that file the way the share sheet would.
                .task {
                    let args = CommandLine.arguments
                    guard UITestStub.isOn, let i = args.firstIndex(of: "-uiTestOpenFile"), args.indices.contains(i + 1) else { return }
                    incoming.handle(URL(fileURLWithPath: args[i + 1]))
                }
                #endif
        }
    }

    private static func makeCoordinator() -> LockCoordinator {
        #if DEBUG
        if UITestStub.isOn {
            return LockCoordinator(lock: UITestStub.lock())
        }
        #endif
        return LockCoordinator(lock: AppLock(authenticator: DeviceAuthenticator()))
    }

    private static func makeCheckup(store: SessionStore) -> CheckupRefresh {
        #if DEBUG
        if UITestStub.isOn { return UITestStub.checkup(store: store) }
        #endif
        return CheckupRefresh.live(store: store)
    }

    private static func makeStore() -> SessionStore {
        #if DEBUG
        if UITestStub.isOn { return UITestStub.store() }
        #endif
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
