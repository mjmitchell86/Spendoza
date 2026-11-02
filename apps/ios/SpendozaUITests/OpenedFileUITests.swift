import XCTest

/// A statement opened from the share sheet. The share sheet itself can't be driven from a UI test, so the app is
/// launched with `-uiTestOpenFile`, which hands the file to the same code `.onOpenURL` calls.
final class OpenedFileUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func file(_ name: String, bytes: Int) throws -> String {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("ui-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let url = folder.appendingPathComponent(name)
        try Data(repeating: 0x25, count: bytes).write(to: url)
        return url.path
    }

    @MainActor func testAnOpenedPDFLandsInMoneysUploadSheet() throws {
        let path = try file("October-statement.pdf", bytes: 2_000)
        let app = Launch.stubbed(openFile: path)
        XCTAssertTrue(app.staticTexts["Upload statements"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["1 file selected"].exists)
        XCTAssertTrue(app.staticTexts["October-statement.pdf"].exists)
        XCTAssertTrue(app.buttons["Upload"].isEnabled)
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "opened-pdf-sheet"
        shot.lifetime = .keepAlways
        add(shot)
    }

    @MainActor func testAFileOpenedWhileABillFormIsUpClosesItAndShowsTheUploadSheet() throws {
        let path = try file("November.pdf", bytes: 2_000)
        // The file arrives 12 seconds after launch: time enough to open the bill form first.
        let app = Launch.stubbed(startOnMoney: true, openFile: path, openFileAfter: 12)
        app.open(.bills)
        app.buttons["Add expense"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Add expense"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["Upload statements"].exists, "The file arrived before the form was open")
        XCTAssertTrue(app.staticTexts["Upload statements"].waitForExistence(timeout: 30), "The upload sheet never showed")
        XCTAssertTrue(app.staticTexts["November.pdf"].exists)
        XCTAssertFalse(app.textFields["Description"].exists, "The bill form is still open")
    }

    @MainActor func testAFileOverTheLimitIsRefusedWithAnAlert() throws {
        let path = try file("big.pdf", bytes: 5 * 1_048_576)
        let app = Launch.stubbed(openFile: path)
        XCTAssertTrue(app.alerts["Couldn't open file"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.alerts.staticTexts["This file is too large (max 4 MB)"].exists)
        XCTAssertFalse(app.staticTexts["Upload statements"].exists)
    }
}
