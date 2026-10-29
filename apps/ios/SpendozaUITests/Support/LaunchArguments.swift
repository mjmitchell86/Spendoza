import XCTest

/// Launches the app against the stub API (Debug builds only): signed in, onboarded, lock passing, never the
/// network or Face ID.
enum Launch {
    static let largestText = "UICTContentSizeCategoryAccessibilityXXXL"

    enum Appearance: String, CaseIterable {
        case light = "Light", dark = "Dark"
    }

    @MainActor
    static func stubbed(appearance: Appearance = .light, textSize: String? = nil,
                        hideTabBar: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        // The launch argument `-AppleInterfaceStyle` doesn't change an iOS app's scheme; the device setting does.
        XCUIDevice.shared.appearance = appearance == .dark ? .dark : .light
        var arguments = ["-uiTestStubAPI", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        if let textSize { arguments += ["-UIPreferredContentSizeCategoryName", textSize] }
        if hideTabBar { arguments.append("-uiTestHideTabBar") }
        app.launchArguments = arguments
        app.launch()
        XCUIDevice.shared.appearance = appearance == .dark ? .dark : .light
        return app
    }
}

/// The three screens of the Health flow.
enum Screen: String, CaseIterable {
    case health = "Health", wants = "Wants", diningOut = "Dining out"
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
        guard let cg = screenshot().image.cgImage, let data = cg.dataProvider?.data, let bytes = CFDataGetBytePtr(data)
        else { return -1 }
        let bytesPerPixel = cg.bitsPerPixel / 8
        let x = 4, y = cg.height / 2
        let offset = y * cg.bytesPerRow + x * bytesPerPixel
        let r = Double(bytes[offset]), g = Double(bytes[offset + 1]), b = Double(bytes[offset + 2])
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255
    }

    /// Where the page is scrolled to: the top edge of the screen's heading, read from the accessibility tree (not
    /// from pixels, so the clock or a fading scroll indicator can't affect it).
    @MainActor
    func scrollPosition(_ screen: Screen) -> CGFloat {
        let probe = switch screen {
        case .health: "Your money's health"
        case .wants: "What moved it"
        case .diningOut: "Transactions"
        }
        return (try? staticTexts[probe].snapshot().frame.minY) ?? .nan
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
