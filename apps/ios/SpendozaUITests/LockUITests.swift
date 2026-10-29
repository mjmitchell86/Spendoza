import XCTest

/// The app lock covers the signed-in screen without rebuilding it.
final class LockUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    /// R19: while locked, nothing underneath is reachable by VoiceOver (or anything else reading the accessibility
    /// tree), even though the screen is still built under the lock.
    @MainActor func testLockedScreenIsHiddenFromAccessibility() {
        let app = Launch.stubbed(lock: .failing)
        XCTAssertTrue(app.buttons["Unlock"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Spendoza is locked"].exists)
        // Give the stubbed account time to load underneath the lock.
        RunLoop.current.run(until: Date().addingTimeInterval(2))
        XCTAssertFalse(app.staticTexts["Your money's health"].exists)
        XCTAssertFalse(app.button(startingWith: "Wants").exists)
        XCTAssertFalse(app.tabBars.buttons["Me"].exists)
    }

    /// I1: going to the background and coming back keeps where the person was.
    @MainActor func testLockingKeepsTheScreenUnderneath() {
        let app = Launch.stubbed(lock: .passing)
        app.open(.wants)

        XCUIDevice.shared.press(.home)
        let deadline = Date().addingTimeInterval(10)
        while app.state == .runningForeground, Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        XCTAssertNotEqual(app.state, .runningForeground)
        app.activate()

        // Face ID passes on its own; the person is still on Wants, not back at the top of Health.
        XCTAssertTrue(app.staticTexts["What moved it"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["Unlock"].exists)
    }
}
