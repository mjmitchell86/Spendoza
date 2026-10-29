import SpendozaKit
import SwiftUI

/// Switches between the signed-out screens, onboarding and the app.
struct RootView: View {
    let store: SessionStore
    let coordinator: LockCoordinator
    private var lock: AppLock { coordinator.lock }
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
                    // Locked content is not built at all, so VoiceOver can't reach it.
                    Group {
                        if lock.isLocked {
                            LockView(coordinator: coordinator)
                        } else {
                            MainTabs(store: store, lock: lock)
                        }
                    }
                    .overlay {
                        if !lock.isLocked && scenePhase != .active {
                            LockView(coordinator: coordinator, offersUnlock: false)
                        }
                    }
                }
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .task {
            store.onInteractiveSignIn = { [coordinator] in coordinator.interactiveSignIn() }
            await store.restore()
            await coordinator.launched(restoredSession: store.restoredSession)
        }
        .onChange(of: scenePhase) { _, phase in
            let mapped: LockScenePhase = switch phase {
            case .active: .active
            case .background: .background
            default: .inactive
            }
            Task { await coordinator.scenePhaseChanged(to: mapped) }
        }
        .onChange(of: store.phase) { _, new in
            if new == .signedOut { coordinator.signedOut() }
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
