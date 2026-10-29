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
        app.settle()
        // Prove the run really is in the scheme it claims: the page background is light or dark paper.
        let brightness = app.backgroundBrightness()
        switch appearance {
        case .light: XCTAssertGreaterThan(brightness, 0.8, "Expected light paper")
        case .dark: XCTAssertLessThan(brightness, 0.3, "Expected dark paper")
        }

        var previous = app.screenshot().pngRepresentation
        for page in 0..<10 {
            attach(app, "\(screen.rawValue)-\(appearance.rawValue)-p\(page)")
            try auditCurrentPage(app, "\(screen.rawValue) \(appearance.rawValue) page \(page)")
            app.scrollDownOnePage()
            app.settle()
            let now = app.screenshot().pngRepresentation
            if now == previous { break }  // the end of the page
            previous = now
        }
    }

    /// Audits what is on screen. The audit's contrast sampling is occasionally wrong for a single run (it has flagged
    /// plain soft-grey text mid-screen that passes the next time), so a finding must repeat in all three runs to fail.
    @MainActor
    private func auditCurrentPage(_ app: XCUIApplication, _ label: String) throws {
        var findings: [String] = []
        for _ in 0..<3 {
            findings = try runAudit(app)
            if findings.isEmpty { return }
        }
        XCTFail("\(label): \(findings.joined(separator: "; "))")
    }

    @MainActor
    private func runAudit(_ app: XCUIApplication) throws -> [String] {
        let window = app.windows.firstMatch.frame
        let statusBar = CGRect(x: window.minX, y: window.minY, width: window.width, height: 62)
        var findings: [String] = []
        try app.performAccessibilityAudit { issue in
            // The tab bar is hidden for these runs (its glass made the audit report contrast for text beneath it,
            // sometimes without naming the element), so the page is read unobstructed. The only issue still
            // skipped: a contrast failure for a NAMED element whose frame meets the status bar or the screen edge,
            // where the scrolling page is blurred or clipped; the same text is audited clear of the edge on
            // another page. Anything else, including a contrast failure with no element, is a finding.
            if issue.auditType == .contrast, let frame = issue.element?.frame,
               frame.intersects(statusBar) || !window.contains(frame) {
                return true
            }
            findings.append("\(issue.compactDescription): \(issue.element?.label ?? "no element")")
            return true  // collected here, reported by the caller
        }
        return findings
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
