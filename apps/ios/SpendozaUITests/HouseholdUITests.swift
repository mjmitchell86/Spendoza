import XCTest

/// The Home tab's household screen against the stub API, which changes what it answers as the actions run.
final class HouseholdUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    @MainActor private func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        var swipes = 0
        while !element.exists || !element.isHittable, swipes < 15 { app.swipeUp(); swipes += 1 }
        XCTAssertTrue(element.isHittable, "\(element) never scrolled into reach")
    }

    /// Waits until the element is gone (a failed `waitForExistence` is how "absent" used to be, wrongly, asserted).
    @MainActor private func waitForDisappearance(_ element: XCUIElement, timeout: TimeInterval = 5,
                                                 _ message: String) {
        let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: element)
        XCTAssertEqual(XCTWaiter().wait(for: [gone], timeout: timeout), .completed, message)
    }

    @MainActor private func shot(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// The head gets a new code, revokes an invitation and removes a member; each change shows at once.
    @MainActor func testHeadGetsANewCodeRevokesAnInvitationAndRemovesAMember() {
        let app = Launch.stubbed(household: "head")
        let code = app.staticTexts["householdInviteCode"]
        XCTAssertTrue(code.waitForExistence(timeout: 15))
        XCTAssertEqual(code.label, "ABCDE-FGHJK")

        app.buttons["Get a new code"].tap()
        let rotate = app.alerts["Get a new code?"]
        XCTAssertTrue(rotate.waitForExistence(timeout: 5))
        XCTAssertTrue(rotate.staticTexts["Anyone who has the old code won't be able to use it. People already in your household stay."].exists)
        rotate.buttons["Get a new code"].tap()
        XCTAssertTrue(app.staticTexts["ZYXWV-UTSRQ"].waitForExistence(timeout: 5))

        let revoke = app.buttons["Revoke, cara@example.com"]
        scrollTo(revoke, in: app)
        revoke.tap()
        XCTAssertTrue(app.buttons["Revoke, dan@example.com"].exists)
        waitForDisappearance(revoke, "The revoked invitation is still listed")

        let remove = app.buttons["Remove from household, Ann Smith"]
        for _ in 0..<15 where !remove.isHittable { app.swipeDown() }
        scrollTo(remove, in: app)
        remove.tap()
        let confirm = app.alerts["Remove from household"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        XCTAssertTrue(confirm.staticTexts["Remove Ann Smith from the household? Your invite code will change."].exists)
        confirm.buttons["Remove from household"].tap()
        waitForDisappearance(app.staticTexts["Ann Smith"], "Ann is still listed")
        for _ in 0..<15 where !app.staticTexts["householdInviteCode"].isHittable { app.swipeDown() }
        XCTAssertEqual(app.staticTexts["householdInviteCode"].label, "KMNPQ-RSTUV")
    }

    /// A member sees the household without the head's tools.
    @MainActor func testMemberHasNoHeadTools() {
        let app = Launch.stubbed(household: "member")
        XCTAssertTrue(app.staticTexts["Members"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Ann Smith (Head)"].exists)
        XCTAssertTrue(app.staticTexts["Test (You)"].exists)
        XCTAssertFalse(app.buttons["Get a new code"].exists)
        XCTAssertFalse(app.buttons["Send invitation"].exists)
        XCTAssertFalse(app.buttons["Delete household"].exists)
        XCTAssertTrue(app.staticTexts["Your sharing preferences"].exists)
    }

    /// Creating a household from the stub closes the sheet and shows the household screen.
    @MainActor func testCreatingAHouseholdShowsIt() {
        let app = Launch.stubbed(household: "none")
        let create = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Create a household'")).firstMatch
        XCTAssertTrue(create.waitForExistence(timeout: 15))
        create.tap()
        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText("The Joneses")
        app.buttons["Create household"].tap()
        // Slow CI simulators can still be animating the sheet away: wait rather than check at once.
        XCTAssertTrue(app.staticTexts["Members"].waitForExistence(timeout: 20), "The household screen never showed")
        waitForDisappearance(app.buttons["Create household"], timeout: 10, "The sheet is still open")
        XCTAssertTrue(app.staticTexts["The Joneses"].waitForExistence(timeout: 10), "The household name never showed")
        XCTAssertTrue(app.staticTexts["householdInviteCode"].waitForExistence(timeout: 10), "The invite code never showed")
        XCTAssertEqual(app.staticTexts["householdInviteCode"].label, "ABCDE-FGHJK")
    }

    /// Joining with a code closes the sheet and shows the household.
    @MainActor func testJoiningAHouseholdShowsIt() {
        let app = Launch.stubbed(household: "none")
        let join = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Join a household'")).firstMatch
        XCTAssertTrue(join.waitForExistence(timeout: 15))
        join.tap()
        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText("ABCDE-FGHJK")
        app.buttons["Join household"].tap()
        XCTAssertTrue(app.staticTexts["Members"].waitForExistence(timeout: 20), "The household screen never showed")
        waitForDisappearance(app.buttons["Join household"], timeout: 10, "The sheet is still open")
        XCTAssertTrue(app.staticTexts["The Smiths"].waitForExistence(timeout: 10), "The household name never showed")
        XCTAssertTrue(app.staticTexts["Ann Smith (Head)"].waitForExistence(timeout: 10), "The head never showed")
        XCTAssertFalse(app.buttons["Get a new code"].exists)
    }

    /// The sole member is the head of a household of one, who can leave and delete it.
    @MainActor func testSoleHeadLeavesAndDeletes() {
        let app = Launch.stubbed(household: "none")
        let create = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Create a household'")).firstMatch
        XCTAssertTrue(create.waitForExistence(timeout: 15))
        create.tap()
        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText("Solo")
        app.buttons["Create household"].tap()
        let leave = app.buttons["Leave & delete"]
        XCTAssertTrue(app.staticTexts["Members"].waitForExistence(timeout: 10))
        scrollTo(leave, in: app)
        leave.tap()
        let alert = app.alerts["Leave & delete household"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        alert.buttons["Leave"].tap()
        XCTAssertTrue(app.staticTexts["Create or join a household to share finances with your family"].waitForExistence(timeout: 10))
    }
}
