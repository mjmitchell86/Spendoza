import XCTest

/// Launches the app against the stub API (Debug builds only): signed in, onboarded, lock passing, never the
/// network or Face ID.
enum Launch {
    static let largestText = "UICTContentSizeCategoryAccessibilityXXXL"

    enum Appearance: String, CaseIterable {
        case light = "Light", dark = "Dark"
    }

    @MainActor
    static func stubbed(appearance: Appearance = .light, textSize: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        var arguments = ["-uiTestStubAPI", "-AppleInterfaceStyle", appearance.rawValue,
                         "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        if let textSize { arguments += ["-UIPreferredContentSizeCategoryName", textSize] }
        app.launchArguments = arguments
        app.launch()
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
}
