import SpendozaKit
import SwiftUI

/// Switches between the signed-out screens, onboarding and the app.
struct RootView: View {
    let store: SessionStore
    let lock: AppLock
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if store.isRestoring {
                ProgressView().tint(Theme.note).frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityLabel("Loading")
            } else if let message = store.loadError {
                LoadFailedView(message: message, retry: { Task { await store.refresh() } },
                               signOut: { Task { await store.signOut() } })
            } else {
                switch store.phase {
                case .signedOut:
                    SignInView(store: store)
                case .onboarding:
                    PlaceholderView(title: "Onboarding", store: store)
                case .ready:
                    MainTabs(store: store, lock: lock)
                        .overlay {
                            if lock.isLocked {
                                LockView(lock: lock)
                            } else if scenePhase != .active {
                                LockView(lock: lock, offersUnlock: false)
                            }
                        }
                        .task { await lock.appDidBecomeActive() }
                }
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .task { await store.restore() }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background: lock.appDidEnterBackground()
            case .active: Task { await lock.appDidBecomeActive() }
            default: break
            }
        }
    }
}

/// Stands in until onboarding exists.
private struct PlaceholderView: View {
    let title: String
    let store: SessionStore

    var body: some View {
        VStack(spacing: 16) {
            Text(title).font(.serif(28, relativeTo: .largeTitle)).foregroundStyle(Theme.ink)
            Button("Sign out") { Task { await store.signOut() } }
                .buttonStyle(SecondaryButtonStyle())
                .padding(.horizontal, 20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct LoadFailedView: View {
    let message: String
    let retry: () -> Void
    let signOut: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Couldn't load your account").font(.serif(28, relativeTo: .largeTitle)).foregroundStyle(Theme.ink)
            InlineError(message: message)
            Button("Try again", action: retry).buttonStyle(PrimaryButtonStyle())
            Button("Sign out", action: signOut).buttonStyle(SecondaryButtonStyle())
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}
