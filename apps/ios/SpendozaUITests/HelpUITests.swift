import XCTest

final class HelpUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    /// The footer link at the bottom of Support opens Privacy at its top, not at Support's scroll offset.
    @MainActor private func switchOpensAtTop(_ appearance: Launch.Appearance) {
        let app = Launch.stubbed(appearance: appearance)
        app.tabBars.buttons["Me"].tap()
        let support = app.buttons["Support"]
        XCTAssertTrue(support.waitForExistence(timeout: 10))
        var supportSwipes = 0
        while !support.isHittable, supportSwipes < 12 { app.swipeUp(); supportSwipes += 1 }
        XCTAssertTrue(support.isHittable, "Support never scrolled into reach")
        support.tap()
        XCTAssertTrue(app.staticTexts["How it works"].waitForExistence(timeout: 5))
        let link = app.links.matching(NSPredicate(format: "label CONTAINS[c] 'privacy'")).firstMatch
        var swipes = 0
        while !link.exists || !link.isHittable, swipes < 12 { app.swipeUp(); swipes += 1 }
        XCTAssertTrue(link.isHittable, "The Privacy link never scrolled into reach")
        link.tap()
        let title = app.staticTexts["Privacy Policy"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        XCTAssertTrue(title.isHittable, "Privacy didn't open at the top")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "task9-switched-\(appearance.rawValue.lowercased())"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor func testSwitchOpensAtTopLight() { switchOpensAtTop(.light) }
    @MainActor func testSwitchOpensAtTopDark() { switchOpensAtTop(.dark) }
}
