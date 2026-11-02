import XCTest

/// The Money tab's screens that the UI tests walk.
enum MoneyScreen: String, CaseIterable {
    case overview = "Overview", transactions = "Transactions", bills = "Bills", categories = "Categories",
         statements = "Statements", statementDetail = "Statement detail"
}

extension XCUIApplication {
    /// Opens Money (the app starts there with `startOnMoney`) and taps through to `screen`.
    @MainActor
    func open(_ screen: MoneyScreen, timeout: TimeInterval = 20) {
        XCTAssertTrue(staticTexts["Total income"].waitForExistence(timeout: timeout), "Money didn't open on Overview")
        switch screen {
        case .overview: break
        case .transactions: openSegment("Transactions", expecting: "Search descriptions", timeout: timeout)
        case .bills: openSegment("Bills", expecting: "Recurring expenses", timeout: timeout)
        case .categories:
            tapLink("Categories", expecting: "Organize your expenses with categories", timeout: timeout)
        case .statements:
            tapLink("Statements", expecting: "Upload and review your bank statements", timeout: timeout)
        case .statementDetail:
            tapLink("Statements", expecting: "Upload and review your bank statements", timeout: timeout)
            let row = buttons.matching(NSPredicate(format: "label CONTAINS 'Joint Checking'")).firstMatch
            XCTAssertTrue(row.waitForExistence(timeout: timeout), "No parsed statement row")
            row.tap()
            XCTAssertTrue(navigationBars["Statement"].waitForExistence(timeout: timeout), "Statement didn't open")
        }
    }

    @MainActor
    private func openSegment(_ name: String, expecting text: String, timeout: TimeInterval) {
        let segment = buttons[name].firstMatch
        XCTAssertTrue(segment.waitForExistence(timeout: timeout), "No \(name) segment")
        segment.tap()
        XCTAssertTrue(descendants(matching: .any)[text].firstMatch.waitForExistence(timeout: timeout), "\(name) didn't open")
    }

    @MainActor
    private func tapLink(_ name: String, expecting text: String, timeout: TimeInterval) {
        let link = buttons[name].firstMatch
        XCTAssertTrue(link.waitForExistence(timeout: timeout), "No \(name) link")
        link.tap()
        XCTAssertTrue(staticTexts[text].waitForExistence(timeout: timeout), "\(name) didn't open")
    }
}
