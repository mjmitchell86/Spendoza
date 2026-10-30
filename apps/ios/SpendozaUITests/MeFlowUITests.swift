import XCTest

final class MeFlowUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    @MainActor private func openMe(admin: Bool) -> XCUIApplication {
        let app = Launch.stubbed(admin: admin)
        XCTAssertTrue(app.staticTexts["Your money's health"].waitForExistence(timeout: 15))
        app.tabBars.buttons["Me"].tap()
        XCTAssertTrue(app.staticTexts["Weekly email reports"].waitForExistence(timeout: 10))
        return app
    }

    @MainActor private func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        var swipes = 0
        while !element.exists || !element.isHittable, swipes < 12 { app.swipeUp(); swipes += 1 }
    }

    @MainActor func testMeListsEveryRowForAnAdmin() {
        let app = openMe(admin: true)
        XCTAssertTrue(app.buttons["Edit name"].exists, "No profile name")
        for title in ["Invite codes", "AI assistants", "Plans & billing", "Admin", "Support", "Privacy", "Delete my account"] {
            let row = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
            scrollTo(row, in: app)
            XCTAssertTrue(row.exists, "No \(title) row")
        }
    }

    @MainActor func testNonAdminHasNoAdminRow() {
        let app = openMe(admin: false)
        scrollTo(app.buttons["Support"], in: app)
        XCTAssertFalse(app.buttons["Admin"].exists)
    }

    @MainActor func testInviteCodesShowTheCount() {
        let app = openMe(admin: false)
        let row = app.buttons["Invite codes"]
        scrollTo(row, in: app)
        row.tap()
        XCTAssertTrue(app.staticTexts["2 of 3 codes created"].waitForExistence(timeout: 10))
    }

    @MainActor func testSupportOpens() {
        let app = openMe(admin: false)
        let row = app.buttons["Support"]
        scrollTo(row, in: app)
        row.tap()
        XCTAssertTrue(app.staticTexts["If a statement fails"].waitForExistence(timeout: 10))
    }

    @MainActor func testAdminReachesAUsersReportAction() {
        let app = openMe(admin: true)
        let admin = app.buttons["Admin"]
        scrollTo(admin, in: app)
        admin.tap()
        XCTAssertTrue(app.staticTexts["Total users"].waitForExistence(timeout: 10))
        app.buttons["Users"].tap()
        let user = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Ann Baker'")).firstMatch
        XCTAssertTrue(user.waitForExistence(timeout: 10))
        user.tap()
        XCTAssertTrue(app.buttons["Refresh report"].waitForExistence(timeout: 10))
    }

    /// With the tab bar showing and the largest text size, the last content of each Me screen scrolls fully above it.
    @MainActor private func endClearsTabBar(_ screen: MeScreen, _ appearance: Launch.Appearance) {
        let app = Launch.stubbed(appearance: appearance, textSize: Launch.largestText, admin: screen.needsAdmin)
        app.open(screen)
        app.scrollToEnd()
        let last = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label BEGINSWITH %@", screen.lastElementPrefix)).firstMatch
        XCTAssertTrue(last.exists, "\(screen.rawValue): no '\(screen.lastElementPrefix)'")
        let bar = app.tabBars.firstMatch.frame
        XCTAssertLessThanOrEqual(last.frame.maxY, bar.minY + 1, "\(screen.rawValue): '\(screen.lastElementPrefix)' sits under the tab bar")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "task14-end-\(screen.rawValue)-\(appearance.rawValue)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor func testMeEndClearsTabBar() { endClearsTabBar(.me, .light) }
    @MainActor func testInviteCodesEndClearsTabBar() { endClearsTabBar(.inviteCodes, .light) }
    @MainActor func testAssistantsEndClearsTabBar() { endClearsTabBar(.assistants, .light) }
    @MainActor func testSupportEndClearsTabBar() { endClearsTabBar(.support, .dark) }
}
