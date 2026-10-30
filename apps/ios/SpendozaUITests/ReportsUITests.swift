import XCTest

final class ReportsUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// A failed schedule save puts the toggle back to the saved value and shows the error.
    @MainActor private func failedSave(_ appearance: Launch.Appearance) {
        let app = Launch.stubbed(appearance: appearance, profileUpdateOffline: true)
        app.tabBars.buttons["Me"].tap()
        let toggle = app.switches["Weekly email reports"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 10))
        XCTAssertEqual(toggle.value as? String, "1")
        toggle.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "You're offline. Check your connection and try again.")).firstMatch.waitForExistence(timeout: 5))
        XCTAssertEqual(toggle.value as? String, "1")
        shot(app, "task6-failure-\(appearance.rawValue.lowercased())")
    }

    @MainActor func testFailedSaveSnapsTheToggleBackLight() { failedSave(.light) }
    @MainActor func testFailedSaveSnapsTheToggleBackDark() { failedSave(.dark) }

    @MainActor func testTestEmailShowsEmailSent() {
        let app = Launch.stubbed()
        app.tabBars.buttons["Me"].tap()
        let toggle = app.switches["Weekly email reports"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 10))
        toggle.tap()
        app.buttons["Send test email"].tap()
        XCTAssertTrue(app.staticTexts["Email sent"].waitForExistence(timeout: 5))
        shot(app, "task6-emailsent")
    }
}
