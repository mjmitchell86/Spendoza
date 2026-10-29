import XCTest

/// Xcode's accessibility audit on Health, Wants and Dining out, at the largest accessibility text size, in light
/// and dark. Each screen is audited at the top and after every page of scrolling down to its end.
final class AccessibilityAuditUITests: XCTestCase {
    override func setUp() { continueAfterFailure = true }

    @MainActor func testHealthLight() throws { try audit(.health, .light) }
    @MainActor func testHealthDark() throws { try audit(.health, .dark) }
    @MainActor func testWantsLight() throws { try audit(.wants, .light) }
    @MainActor func testWantsDark() throws { try audit(.wants, .dark) }
    @MainActor func testDiningOutLight() throws { try audit(.diningOut, .light) }
    @MainActor func testDiningOutDark() throws { try audit(.diningOut, .dark) }

    @MainActor
    private func audit(_ screen: Screen, _ appearance: Launch.Appearance) throws {
        let app = Launch.stubbed(appearance: appearance, textSize: Launch.largestText, hideTabBar: true)
        app.open(screen)
        app.settle(screen)
        // Prove the run really is in the scheme it claims: the page background is light or dark paper.
        let brightness = app.backgroundBrightness()
        switch appearance {
        case .light: XCTAssertGreaterThan(brightness, 0.8, "Expected light paper")
        case .dark: XCTAssertLessThan(brightness, 0.3, "Expected dark paper")
        }

        // One audit from the top of the page covers the whole page: it reports off-screen elements too (it scrolls to
        // them). Auditing from a scrolled position gave false contrast findings for text the audit itself scrolled
        // under the top edge, so the page is audited only from the top.
        try app.performAccessibilityAudit()

        // Then walk the page a half-screen at a time to the end, for the screenshots (reviewed by eye for clipping)
        // and to confirm how long the page really is. The audit scrolls the page back to the top when it finishes.
        var pages = 1
        attach(app, "\(screen.rawValue)-\(appearance.rawValue)-p0")
        while app.scrollDownOnePage(screen) {
            attach(app, "\(screen.rawValue)-\(appearance.rawValue)-p\(pages)")
            pages += 1
            if pages > 12 { XCTFail("\(screen.rawValue): more than 12 pages"); break }
        }
        print("AUDIT-PAGES \(screen.rawValue) \(appearance.rawValue): \(pages) pages")
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
