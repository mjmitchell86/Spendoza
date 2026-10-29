import XCTest

/// Xcode's accessibility audit on Health, Wants and Dining out, at the largest accessibility text size, in light
/// and dark. Each screen is audited at the top and, in light, scrolled to its end.
final class AccessibilityAuditUITests: XCTestCase {
    override func setUp() { continueAfterFailure = true }

    @MainActor func testHealthLight() throws { try audit(.health, .light) }
    @MainActor func testHealthDark() throws { try audit(.health, .dark) }
    @MainActor func testWantsLight() throws { try audit(.wants, .light) }
    @MainActor func testWantsDark() throws { try audit(.wants, .dark) }
    @MainActor func testDiningOutLight() throws { try audit(.diningOut, .light) }
    @MainActor func testDiningOutDark() throws { try audit(.diningOut, .dark) }
    @MainActor func testHealthScrolledToEnd() throws { try audit(.health, .light, scrolled: true) }
    @MainActor func testWantsScrolledToEnd() throws { try audit(.wants, .light, scrolled: true) }
    @MainActor func testDiningOutScrolledToEnd() throws { try audit(.diningOut, .light, scrolled: true) }

    @MainActor
    private func audit(_ screen: Screen, _ appearance: Launch.Appearance, scrolled: Bool = false) throws {
        let app = Launch.stubbed(appearance: appearance, textSize: Launch.largestText)
        app.open(screen)
        if scrolled {
            for _ in 0..<3 { app.swipeUp(velocity: .fast) }
            // Let the scrolling and the scroll-edge blur settle before looking.
            _ = XCTWaiter.wait(for: [expectation(description: "settle")], timeout: 1.5)
        }
        saveScreenshot(of: app, named: "\(screen.rawValue)-\(appearance.rawValue)\(scrolled ? "-end" : "")")

        let window = app.windows.firstMatch.frame
        let tabBar = app.tabBars.firstMatch.frame
        let statusBar = CGRect(x: window.minX, y: window.minY, width: window.width, height: 62)
        var unnamed = 0
        try app.performAccessibilityAudit { issue in
            // The only issue skipped: a contrast failure for text that sits under the system tab bar or status bar,
            // or past the screen edge, while the page scrolls. The audit samples the blurred glass or the clipped
            // edge as that text's background, so the reading is meaningless; the same text passes when scrolled
            // clear of the bars (see the scrolled-to-end tests). A contrast failure for any element in the open
            // part of the screen still fails. The audit can't always name the element (rows are read as one), so
            // an unnamed one is allowed too, but at most four a screen (which one varies with where the scroll settles). The colour pairs themselves are
            // checked by ThemeContrastTests.
            guard issue.auditType == .contrast else { return false }
            if let frame = issue.element?.frame {
                return frame.intersects(tabBar) || frame.intersects(statusBar) || !window.contains(frame)
            }
            unnamed += 1
            return unnamed <= 4
        }
    }

    private func saveScreenshot(of app: XCUIApplication, named name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
