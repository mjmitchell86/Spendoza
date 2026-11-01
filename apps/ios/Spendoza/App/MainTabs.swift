import SpendozaKit
import SwiftUI

/// The signed-in app. Only tabs that exist: Health, Home and Me. Uses the system tab bar (the iOS 26 floating glass capsule).
struct MainTabs: View {
    let store: SessionStore
    let lock: AppLock
    @State private var selection = Self.initialTab

    /// `-uiTestStartOnMe` (Debug builds only, with the stub API) opens on Me: with the tab bar hidden for an audit
    /// there is nothing to tap to get there.
    private static var initialTab: String {
        #if DEBUG
        if UITestStub.isOn, CommandLine.arguments.contains("-uiTestStartOnMe") { return "Me" }
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
