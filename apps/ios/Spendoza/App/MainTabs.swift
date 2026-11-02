import SpendozaKit
import SwiftUI

/// The signed-in app. Only tabs that exist: Health, Money, Home and Me. Uses the system tab bar (the iOS 26 floating glass capsule).
struct MainTabs: View {
    let store: SessionStore
    let lock: AppLock
    let incoming: IncomingStatements
    @State private var selection = Self.initialTab
    /// The one statement poller of this signed-in session; it stops when the signed-in screens go away.
    @State private var poller: StatementPoller

    init(store: SessionStore, lock: AppLock, incoming: IncomingStatements) {
        self.store = store
        self.lock = lock
        self.incoming = incoming
        let poller = StatementPoller(api: store.api)
        poller.onSessionEnded = { [store] in Task { await store.signOut() } }
        poller.onAccountDisabled = { [store] text in Task { await store.accountDisabled(text) } }
        _poller = State(initialValue: poller)
    }

    /// `-uiTestStartOnMe` (Debug builds only, with the stub API) opens on Me (`-uiTestStartOnMoney` on Money, and `-uiTestHousehold` on Home): with the tab bar hidden for an audit
    /// there is nothing to tap to get there.
    private static var initialTab: String {
        #if DEBUG
        if UITestStub.isOn, CommandLine.arguments.contains("-uiTestStartOnMe") { return "Me" }
        if UITestStub.isOn, CommandLine.arguments.contains("-uiTestStartOnMoney") { return "Money" }
        if UITestStub.householdMode != nil { return "Home" }
        #endif
        return "Health"
    }

    var body: some View {
        TabView(selection: $selection) {
            Tab("Health", systemImage: "gauge.with.needle", value: "Health") {
                HealthView(api: store.api, cache: AppServices.reportCache, snapshots: AppServices.snapshots,
                           scope: AppServices.accountScope, onSessionEnded: { Task { await store.signOut() } },
                           onAccountDisabled: { text in Task { await store.accountDisabled(text) } })
                    .debugHidingTabBar()
            }
            Tab("Money", systemImage: "banknote", value: "Money") {
                MoneyView(api: store.api,
                          poller: poller,
                          incoming: incoming,
                          isLocked: lock.isLocked,
                          selfID: { [store] in store.profile?.id },
                          onSessionEnded: { Task { await store.signOut() } },
                          onAccountDisabled: { text in Task { await store.accountDisabled(text) } })
                    .debugHidingTabBar()
            }
            Tab("Home", systemImage: "house", value: "Home") {
                HomeView(store: store)
                    .debugHidingTabBar()
            }
            Tab("Me", systemImage: "person", value: "Me") {
                MeView(store: store, lock: lock)
                    .debugHidingTabBar()
            }
        }
        .tint(Theme.note)
        .onDisappear { poller.stop() }
        // A statement opened from outside the app goes to Money's upload sheet (once the app is unlocked).
        .onChange(of: !incoming.pending.isEmpty && !lock.isLocked, initial: true) { _, waiting in
            if waiting { selection = "Money" }
        }
        // After sign-up with a household code, open on Home where the result is told.
        .onChange(of: store.signUpNotice != nil, initial: true) { _, hasNotice in
            if hasNotice { selection = "Home" }
        }
    }
}

private extension View {
    /// The accessibility audit can't read text under the tab bar's glass, so the audits hide the bar
    /// (`-uiTestHideTabBar`, Debug builds only, with the stub API) and read the page itself.
    @ViewBuilder func debugHidingTabBar() -> some View {
        #if DEBUG
        if UITestStub.isOn, CommandLine.arguments.contains("-uiTestHideTabBar") {
            toolbarVisibility(.hidden, for: .tabBar)
        } else {
            self
        }
        #else
        self
        #endif
    }
}
