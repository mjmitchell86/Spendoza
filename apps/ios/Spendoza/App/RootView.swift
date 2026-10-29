import SpendozaKit
import SwiftUI

/// Switches between the signed-out screens, onboarding and the app.
struct RootView: View {
    let store: SessionStore
    let coordinator: LockCoordinator
    private var lock: AppLock { coordinator.lock }
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        let content = rootContent(phase: store.phase, isLocked: lock.isLocked,
                                  isRestoring: store.isRestoring, loadFailed: store.loadError != nil)
        Group {
            switch content {
            case .restoring:
                ProgressView().tint(Theme.note).frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityLabel("Loading")
            case .signIn:
                SignInView(store: store)
            case .lock:
                // Locked content is not built at all, so VoiceOver can't reach it.
                LockView(coordinator: coordinator)
            case .loadFailed:
                LoadFailedView(message: store.loadError ?? "", retry: { Task { await store.refresh() } },
                               signOut: { Task { await store.signOut() } })
            case .onboarding:
                PlaceholderView(title: "Onboarding", store: store)
            case .ready:
                MainTabs(store: store, lock: lock)
            }
        }
        .overlay {
            // App-switcher snapshot cover for every signed-in screen.
            if scenePhase != .active, content != .signIn, content != .restoring, content != .lock {
                LockView(coordinator: coordinator, offersUnlock: false)
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
