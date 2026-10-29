import SpendozaKit
import SwiftUI

/// The signed-in app. Only tabs that exist: Health and Me. Uses the system tab bar (the iOS 26 floating glass capsule).
struct MainTabs: View {
    let store: SessionStore
    let lock: AppLock

    var body: some View {
        TabView {
            Tab("Health", systemImage: "gauge.with.needle") {
                HealthView(api: store.api, cache: AppServices.reportCache, snapshots: AppServices.snapshots,
                           scope: AppServices.accountScope, onSessionEnded: { Task { await store.signOut() } })
                    .debugHidingTabBar()
            }
            Tab("Me", systemImage: "person") {
                MeView(store: store, lock: lock)
            }
        }
        .tint(Theme.note)
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
