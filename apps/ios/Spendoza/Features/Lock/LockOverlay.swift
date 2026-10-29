import SpendozaKit
import SwiftUI
import UIKit

/// Shows the lock screen (or, while the app is inactive, the privacy cover) in its own window above the app's.
///
/// A view inside the app's window can't cover what that window presents (sheets, full-screen covers, alerts sit
/// above the root view), so the lock lives in a separate window at alert level. While locked, the app's window is
/// also hidden from accessibility and gives up the keyboard, so nothing presented is reachable either.
@MainActor
final class LockOverlay {
    enum Mode: Equatable { case none, privacy, locked }

    private weak var mainWindow: UIWindow?
    private var window: UIWindow?
    private var host: UIHostingController<AnyView>?
    private var mode: Mode = .none
    private var coordinator: LockCoordinator?
    private var style: UIUserInterfaceStyle = .unspecified

    /// The app's window, found once the root view is on screen.
    func attach(_ mainWindow: UIWindow) {
        guard !(mainWindow is OverlayWindow), self.mainWindow !== mainWindow else { return }
        self.mainWindow = mainWindow
        apply()
    }

    func update(mode: Mode, coordinator: LockCoordinator, style: UIUserInterfaceStyle) {
        self.mode = mode
        self.coordinator = coordinator
        self.style = style
        apply()
    }

    private func apply() {
        guard let main = mainWindow, let scene = main.windowScene, let coordinator else { return }
        let locked = mode == .locked
        main.accessibilityElementsHidden = locked
        if locked { main.endEditing(true) }
        guard mode != .none else {
            window?.isHidden = true
            return
        }
        let overlay = window ?? makeWindow(scene: scene)
        host?.rootView = AnyView(LockView(coordinator: coordinator, offersUnlock: locked))
        overlay.overrideUserInterfaceStyle = style
        overlay.isHidden = false
        if locked { UIAccessibility.post(notification: .screenChanged, argument: overlay) }
    }

    private func makeWindow(scene: UIWindowScene) -> UIWindow {
        let overlay = OverlayWindow(windowScene: scene)
        overlay.windowLevel = .alert + 1
        let host = UIHostingController(rootView: AnyView(EmptyView()))
        host.view.backgroundColor = .clear
        overlay.rootViewController = host
        overlay.accessibilityViewIsModal = true
        self.host = host
        window = overlay
        return overlay
    }
}

private final class OverlayWindow: UIWindow {}

/// Hands the hosting window to `found` when the view lands in one.
struct WindowReader: UIViewRepresentable {
    let found: (UIWindow) -> Void

    func makeUIView(context: Context) -> ReaderView {
        let view = ReaderView()
        view.found = found
        view.isUserInteractionEnabled = false
        view.isAccessibilityElement = false
        return view
    }

    func updateUIView(_ view: ReaderView, context: Context) { view.found = found }

    final class ReaderView: UIView {
        var found: ((UIWindow) -> Void)?
        override func didMoveToWindow() {
            super.didMoveToWindow()
            if let window { found?(window) }
        }
    }
}

extension Appearance {
    var interfaceStyle: UIUserInterfaceStyle {
        switch self {
        case .system: .unspecified
        case .light: .light
        case .dark: .dark
        }
    }
}
