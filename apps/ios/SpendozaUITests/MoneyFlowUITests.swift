import XCTest

/// The Money flows end to end against the stub API: Overview, search and recategorize, adding a bill, creating a
/// category, and a failed statement.
final class MoneyFlowUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    @MainActor func testMoneyOpensOnOverview() {
        let app = Launch.stubbed(startOnMoney: true)
        XCTAssertTrue(app.staticTexts["Total income"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["Total expenses"].exists)
        XCTAssertTrue(app.buttons["Add statement"].exists)
    }

    @MainActor func testSearchNarrowsTheListAndRecategorizingMovesARow() {
        let app = Launch.stubbed(startOnMoney: true)
        app.open(.transactions)
        let venmo = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Venmo J. Alvarez'")).firstMatch
        let whole = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Whole Foods'")).firstMatch
        XCTAssertTrue(venmo.waitForExistence(timeout: 15))
        XCTAssertTrue(whole.exists)

        let search = app.textFields["Search descriptions"]
        search.tap()
        search.typeText("venmo")
        XCTAssertTrue(venmo.waitForExistence(timeout: 10))
        XCTAssertTrue(whole.waitForNonExistence(timeout: 10), "Search didn't narrow the list")
        XCTAssertTrue(app.staticTexts["Transactions (1)"].exists)

        // It is uncategorized: move it to Groceries.
        XCTAssertTrue(venmo.label.contains("Uncategorized"), "Expected an uncategorized row, got \(venmo.label)")
        venmo.tap()
        XCTAssertTrue(app.staticTexts["Move to another category"].waitForExistence(timeout: 10))
        let groceries = app.buttons["Groceries"].firstMatch
        XCTAssertTrue(groceries.waitForExistence(timeout: 10))
        groceries.tap()
        XCTAssertTrue(app.staticTexts["Moved Venmo J. Alvarez to Groceries."].waitForExistence(timeout: 10))
        let moved = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Venmo J. Alvarez' AND label CONTAINS 'Groceries'")).firstMatch
        XCTAssertTrue(moved.waitForExistence(timeout: 10), "The row didn't move to Groceries")

        // Undo puts it back.
        app.buttons["Undo"].tap()
        let back = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Venmo J. Alvarez' AND label CONTAINS 'Uncategorized'")).firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 10), "Undo didn't restore the category")
    }

    @MainActor func testAddAnExpenseFromBills() {
        let app = Launch.stubbed(startOnMoney: true)
        app.open(.bills)
        app.buttons["Add expense"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Add expense"].waitForExistence(timeout: 10))
        let description = app.textFields["Description"]
        description.tap()
        description.typeText("Storage unit")
        let amount = app.textFields["Amount"]
        amount.tap()
        amount.typeText("85")
        let category = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Category,'")).firstMatch
        XCTAssertTrue(category.waitForExistence(timeout: 10))
        category.tap()
        let housing = app.buttons["Housing"].firstMatch
        XCTAssertTrue(housing.waitForExistence(timeout: 10))
        housing.tap()
        let save = app.buttons["Add expense"].firstMatch
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.staticTexts["Add expense"].waitForNonExistence(timeout: 15), "The sheet didn't close")
        let row = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Storage unit'")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 15), "The new bill isn't listed")
    }

    @MainActor func testCreateACategory() {
        let app = Launch.stubbed(startOnMoney: true)
        app.open(.categories)
        app.buttons["New category"].firstMatch.tap()
        let name = app.textFields["Name"]
        XCTAssertTrue(name.waitForExistence(timeout: 10))
        name.tap()
        name.typeText("Pet care")
        let create = app.buttons["Create category"]
        XCTAssertTrue(create.isEnabled)
        create.tap()
        XCTAssertTrue(create.waitForNonExistence(timeout: 15), "The sheet didn't close")
        XCTAssertTrue(app.staticTexts["Pet care"].waitForExistence(timeout: 15), "The new category isn't listed")
    }

    @MainActor func testAFailedStatementShowsItsReasonAndRetry() {
        let app = Launch.stubbed(startOnMoney: true)
        app.open(.statements)
        XCTAssertTrue(app.staticTexts["Could not find any transactions in this PDF"].waitForExistence(timeout: 15), "No failure reason")
        XCTAssertTrue(app.buttons["Retry"].firstMatch.exists)
        XCTAssertTrue(app.buttons["Remove"].firstMatch.exists)
    }
}
