import XCTest

final class HealthFlowUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    @MainActor func testHealthToWantsToDiningOutShowsTheSteakhouse() {
        let app = Launch.stubbed()

        // Health: the score and the Wants part.
        XCTAssertTrue(app.staticTexts["Your money's health"].waitForExistence(timeout: 15))
        let dial = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS 'Health score 64 of 100'")).firstMatch
        XCTAssertTrue(dial.exists)
        let wants = app.button(startingWith: "Wants")
        XCTAssertTrue(wants.waitForExistence(timeout: 5))
        wants.tap()

        // Wants: what moved it, and Dining out within it.
        XCTAssertTrue(app.staticTexts["What moved it"].waitForExistence(timeout: 10))
        let dining = app.button(startingWith: "Dining out")
        XCTAssertTrue(dining.waitForExistence(timeout: 5))
        dining.tap()

        // Dining out: the fixture's biggest transaction, by label and amount.
        let steakhouse = app.buttons["Steakhouse 1820, $212.40, Oct 18"]
        XCTAssertTrue(steakhouse.waitForExistence(timeout: 10))
    }

    /// 9.47: switching tabs while an older check-up loads doesn't drop the choice.
    @MainActor func testAPickedMonthSurvivesATabSwitch() {
        let app = Launch.stubbed(slowSelect: true)
        let menu = app.buttons["October check-up"]
        XCTAssertTrue(menu.waitForExistence(timeout: 15))
        menu.tap()
        let september = app.buttons["September check-up"]
        XCTAssertTrue(september.waitForExistence(timeout: 5))
        september.tap()

        app.tabBars.buttons["Me"].tap()
        app.tabBars.buttons["Health"].tap()

        XCTAssertTrue(app.buttons["September check-up"].waitForExistence(timeout: 10))
    }
}
