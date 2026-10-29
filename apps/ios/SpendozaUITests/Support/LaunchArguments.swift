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

    /// Waits until the screen stops changing (two identical screenshots in a row), so scrolling and blurs have settled.
    @MainActor
    func settle(timeout: TimeInterval = 10) {
        var last = screenshot().pngRepresentation
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.3))
            let now = screenshot().pngRepresentation
            if now == last { return }
            last = now
        }
    }

    /// A slow swipe of about a page, which doesn't fling.
    @MainActor
    func scrollDownOnePage() {
        windows.firstMatch.swipeUp(velocity: .slow)
    }
}
