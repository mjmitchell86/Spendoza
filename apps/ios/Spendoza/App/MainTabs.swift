import SpendozaKit
import SwiftUI

/// The signed-in app. Only tabs that exist: Health and Me. Uses the system tab bar (the iOS 26 floating glass capsule).
struct MainTabs: View {
    let store: SessionStore
    let lock: AppLock

    var body: some View {
        TabView {
            Tab("Health", systemImage: "gauge.with.needle") {
                HealthPlaceholderView()
            }
            Tab("Me", systemImage: "person") {
                MeView(store: store, lock: lock)
            }
        }
        .tint(Theme.note)
    }
}
