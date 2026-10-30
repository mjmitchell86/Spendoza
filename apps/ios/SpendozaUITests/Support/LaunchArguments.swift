import XCTest

/// Launches the app against the stub API (Debug builds only): signed in, onboarded, lock passing, never the
/// network or Face ID.
enum Launch {
    static let largestText = "UICTContentSizeCategoryAccessibilityXXXL"

    enum Appearance: String, CaseIterable {
        case light = "Light", dark = "Dark"
    }

    /// The app lock in a stubbed launch: off, on with Face ID passing, on with Face ID always failing, or on with
    /// Face ID alternating pass (launch), fail (next automatic prompt), pass (the Unlock button).
    enum Lock { case off, passing, failing, alternating }

    @MainActor
    static func stubbed(appearance: Appearance = .light, textSize: String? = nil,
                        hideTabBar: Bool = false, lock: Lock = .off, slowSelect: Bool = false,
                        budgetNotOnPlan: Bool = false, profileUpdateOffline: Bool = false,
                        admin: Bool = false, startOnMe: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        // The launch argument `-AppleInterfaceStyle` doesn't change an iOS app's scheme; the device setting does.
        XCUIDevice.shared.appearance = appearance == .dark ? .dark : .light
        var arguments = ["-uiTestStubAPI", "-AppleLanguages", "(en)", "-AppleLocale", "en_US",
                         "-uiTestColorScheme", appearance == .dark ? "dark" : "light"]
        if let textSize { arguments += ["-UIPreferredContentSizeCategoryName", textSize] }
        if hideTabBar { arguments.append("-uiTestHideTabBar") }
        if slowSelect { arguments.append("-uiTestSlowSelect") }
        if budgetNotOnPlan { arguments.append("-uiTestBudgetNotOnPlan") }
        if profileUpdateOffline { arguments.append("-uiTestProfileUpdateOffline") }
        if admin { arguments.append("-uiTestAdmin") }
        if startOnMe { arguments.append("-uiTestStartOnMe") }
        switch lock {
        case .off: break
        case .passing: arguments.append("-uiTestLockEnabled")
        case .failing: arguments += ["-uiTestLockEnabled", "-uiTestLockFails"]
        case .alternating: arguments += ["-uiTestLockEnabled", "-uiTestLockAlternates"]
        }
        app.launchArguments = arguments
        app.launch()
        XCUIDevice.shared.appearance = appearance == .dark ? .dark : .light
        return app
    }
}

/// A text on the page and where its top edge is.
struct ScrollMark: Equatable {
    let label: String
    let y: CGFloat
}

extension Launch {
    /// Brightness (0 dark ... 1 light) of one pixel (x from the left, y from the top). The pixel is drawn into a
    /// known RGBA layout first, so a screenshot's byte order (often BGRA) can't swap red and blue (12.65).
    static func brightness(of image: CGImage, x: Int, y: Int) -> Double? {
        var pixel = [UInt8](repeating: 0, count: 4)
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(data: &pixel, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4, space: space,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)
        else { return nil }
        context.draw(image, in: CGRect(x: -x, y: -(image.height - 1 - y), width: image.width, height: image.height))
        return (0.299 * Double(pixel[0]) + 0.587 * Double(pixel[1]) + 0.114 * Double(pixel[2])) / 255
    }

    /// The probe's mark when it's in `texts` (tree order), else the first labelled text's; nil when there is none.
    static func scrollMark(probe: String, texts: [(label: String, minY: CGFloat)]) -> ScrollMark? {
        if let hit = texts.first(where: { $0.label == probe }) { return ScrollMark(label: probe, y: hit.minY) }
        return texts.first { !$0.label.isEmpty }.map { ScrollMark(label: $0.label, y: $0.minY) }
    }
}

/// The three screens of the Health flow.
enum Screen: String, CaseIterable {
    case health = "Health", wants = "Wants", diningOut = "Dining out"

    /// How the last element on the page (with the stub's data) starts.
    var lastElementPrefix: String {
        switch self {
        case .health: "Dining out is up $310 since September"
        case .wants: "Set a $150 budget for Dining out"
        case .diningOut: "Panera Bread"
        }
    }
}

extension XCUIApplication {
    func button(startingWith prefix: String) -> XCUIElement {
        buttons.matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).firstMatch
    }

    /// Taps through Health → Wants → Dining out as far as `screen`.
    @MainActor
    func open(_ screen: Screen, timeout: TimeInterval = 15) {
        XCTAssertTrue(staticTexts["Your money's health"].waitForExistence(timeout: timeout), "Health didn't load")
        guard screen != .health else { return }
        let wants = button(startingWith: "Wants")
        XCTAssertTrue(wants.waitForExistence(timeout: timeout), "No Wants row")
        wants.tap()
        XCTAssertTrue(staticTexts["What moved it"].waitForExistence(timeout: timeout), "Wants didn't open")
        guard screen != .wants else { return }
        let dining = button(startingWith: "Dining out")
        XCTAssertTrue(dining.waitForExistence(timeout: timeout), "No Dining out row")
        dining.tap()
        XCTAssertTrue(staticTexts["Transactions"].waitForExistence(timeout: timeout), "Dining out didn't open")
    }

    /// Brightness (0 dark ... 1 light) of the page background, read from a screenshot pixel beside the content.
    @MainActor
    func backgroundBrightness() -> Double {
        guard let cg = screenshot().image.cgImage else { return -1 }
        return Launch.brightness(of: cg, x: 4, y: cg.height / 2) ?? -1
    }

    /// Where the page is scrolled to, read from the accessibility tree (not from pixels, so the clock or a fading
    /// scroll indicator can't affect it): the top edge of the screen's heading, or of the first text on the page
    /// once the heading has scrolled out of the tree. Never NaN (12.67).
    @MainActor
    func scrollPosition(_ screen: Screen) -> ScrollMark? {
        let probe = switch screen {
        case .health: "Your money's health"
        case .wants: "What moved it"
        case .diningOut: "Transactions"
        }
        if let frame = try? staticTexts[probe].snapshot().frame {
            return ScrollMark(label: probe, y: frame.minY)
        }
        guard let root = try? snapshot() else { return nil }
        var texts: [(label: String, minY: CGFloat)] = []
        func walk(_ node: XCUIElementSnapshot) {
            if node.elementType == .staticText { texts.append((node.label, node.frame.minY)) }
            node.children.forEach(walk)
        }
        walk(root)
        return Launch.scrollMark(probe: probe, texts: texts)
    }

    /// Waits until the page stops moving (the same position twice in a row).
    @MainActor
    func settle(_ screen: Screen, timeout: TimeInterval = 10) {
        var last = scrollPosition(screen)
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.4))
            let now = scrollPosition(screen)
            if now == last { return }
            last = now
        }
    }

    /// Drags the page up by about half a screen and holds, so it doesn't fling past content the audit hasn't seen.
    /// Returns false when the page didn't move in three tries: it is at its end.
    @MainActor
    func scrollDownOnePage(_ screen: Screen) -> Bool {
        let before = scrollPosition(screen)
        for _ in 0..<3 {
            let from = coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
            let to = coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3))
            from.press(forDuration: 0.05, thenDragTo: to, withVelocity: .default, thenHoldForDuration: 0.3)
            settle(screen)
            if scrollPosition(screen) != before { return true }
        }
        return false
    }
}
