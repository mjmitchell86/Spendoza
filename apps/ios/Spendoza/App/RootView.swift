import SpendozaKit
import SwiftUI

/// Switches between the signed-out screens, onboarding and the app.
struct RootView: View {
    let store: SessionStore
    let coordinator: LockCoordinator
    let checkup: CheckupRefresh
    private var lock: AppLock { coordinator.lock }
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage(Appearance.defaultsKey) private var appearance: Appearance = .system
    @State private var overlay = LockOverlay()

    /// Locked: the lock screen. Inactive or in the background while signed in: the privacy cover.
    private func overlayMode(content: RootContent, covered: Bool) -> LockOverlay.Mode {
        if covered { return .locked }
        if scenePhase != .active, content != .signIn, content != .restoring { return .privacy }
        return .none
    }

    var body: some View {
        let content = rootContent(phase: store.phase, isRestoring: store.isRestoring, loadFailed: store.loadError != nil)
        let covered = lockCovers(content, isLocked: lock.isLocked)
        ZStack {
            // The screen stays built while locked (navigation and onboarding uploads survive a lock), but VoiceOver
            // can't reach it, it takes no input, and the opaque lock screen hides it.
            LockableHost(covered: covered, content: screen(content))
                .accessibilityHidden(covered)
                .allowsHitTesting(!covered)
                .disabled(covered)
            // The lock itself is shown by `overlay` in a window above this one, which also covers anything this
            // screen presents (sheets, full-screen covers). This copy only guards the moment before that window
            // exists.
            if covered {
                LockView(coordinator: coordinator)
            }
        }
        .overlay {
            // App-switcher snapshot cover for every signed-in screen (also shown by `overlay`, above sheets).
            if scenePhase != .active, content != .signIn, content != .restoring, !covered {
                LockView(coordinator: coordinator, offersUnlock: false)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .background(WindowReader { overlay.attach($0) })
        .onChange(of: overlayMode(content: content, covered: covered), initial: true) { _, mode in
            overlay.update(mode: mode, coordinator: coordinator, style: appearance.interfaceStyle)
        }
        .onChange(of: appearance) { _, new in
            overlay.update(mode: overlayMode(content: content, covered: covered), coordinator: coordinator,
                           style: new.interfaceStyle)
        }
        .task {
            store.onInteractiveSignIn = { [coordinator] in coordinator.interactiveSignIn() }
            // Every sign-out reaches the lock, including one from "Couldn't load your account" (the phase was
            // already .signedOut there, so watching the phase would miss it).
            store.onSessionEnded = { [coordinator] in coordinator.signedOut() }
            await store.restore()
            await coordinator.launched(restoredSession: store.restoredSession)
        }
        .task(id: content == .ready) {
            // First time the app is ready: ask once for permission to announce the monthly check-up.
            guard content == .ready else { return }
            checkup.schedule()
            await checkup.requestPermissionIfNeeded()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .inactive, content == .ready { checkup.schedule() }
            let mapped: LockScenePhase = switch phase {
            case .active: .active
            case .background: .background
            default: .inactive
            }
            Task { await coordinator.scenePhaseChanged(to: mapped) }
        }
    }

    @ViewBuilder private func screen(_ content: RootContent) -> some View {
        switch content {
        case .restoring:
            ProgressView().tint(Theme.note).frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityLabel("Loading")
        case .signIn:
            SignInView(store: store)
        case .loadFailed:
            LoadFailedView(message: store.loadError ?? "", retry: { Task { await store.refresh() } },
                           signOut: { Task { await store.signOut() } })
        case .onboarding:
            OnboardingView(api: store.api, signOut: { Task { await store.signOut() } },
                           onFinish: { Task { await store.refresh() } })
        case .ready:
            MainTabs(store: store, lock: lock)
        }
    }
}

/// Hosts the signed-in screen in a UIKit container of our own so the lock can hide all of it from accessibility.
/// SwiftUI's `.accessibilityHidden` doesn't reach into the UIKit tab and navigation controllers that `TabView` and
/// `NavigationStack` are built from (the accessibility tree still listed the Health page under the lock), and
/// SwiftUI reads a platform view's `accessibilityElements` directly, so `CoverableView` returns none while covered.
private struct LockableHost<Content: View>: UIViewControllerRepresentable {
    let covered: Bool
    let content: Content

    func makeUIViewController(context: Context) -> LockableHostController<Content> {
        LockableHostController(content: content)
    }

    func updateUIViewController(_ controller: LockableHostController<Content>, context: Context) {
        controller.host.rootView = content
        controller.coverableView.covered = covered
    }
}

final class LockableHostController<Content: View>: UIViewController {
    let host: UIHostingController<Content>
    var coverableView: CoverableView { view as! CoverableView }

    init(content: Content) {
        host = UIHostingController(rootView: content)
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func loadView() { view = CoverableView() }

    override func viewDidLoad() {
        super.viewDidLoad()
        addChild(host)
        host.view.backgroundColor = .clear
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        host.didMove(toParent: self)
    }
}

/// While covered: no accessibility elements (so nothing underneath is reachable) and no touches.
final class CoverableView: UIView {
    var covered = false {
        didSet {
            guard covered != oldValue else { return }
            accessibilityElementsHidden = covered
            isUserInteractionEnabled = !covered
            UIAccessibility.post(notification: .screenChanged, argument: nil)
        }
    }

    override var accessibilityElements: [Any]? {
        get { covered ? [] : super.accessibilityElements }
        set { super.accessibilityElements = newValue }
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
