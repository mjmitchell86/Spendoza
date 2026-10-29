import CoreGraphics
import XCTest

/// Tests for the UI tests' own helpers (no app launch).
final class SupportTests: XCTestCase {
    /// A 2 x 2 image of one colour in the given layout.
    private func image(r: UInt8, g: UInt8, b: UInt8, bgra: Bool) throws -> CGImage {
        let pixel: [UInt8] = bgra ? [b, g, r, 255] : [r, g, b, 255]
        var bytes = Array([[UInt8]](repeating: pixel, count: 4).joined())
        let info: UInt32 = bgra
            ? CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
            : CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
        let context = try XCTUnwrap(CGContext(data: &bytes, width: 2, height: 2, bitsPerComponent: 8, bytesPerRow: 8,
                                              space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: info))
        return try XCTUnwrap(context.makeImage())
    }

    /// 12.65: the same blue reads the same in either byte order (a BGRA screenshot read as RGB looked red).
    func testBrightnessIgnoresByteOrder() throws {
        let rgba = try XCTUnwrap(Launch.brightness(of: try image(r: 0, g: 0, b: 255, bgra: false), x: 1, y: 1))
        let bgra = try XCTUnwrap(Launch.brightness(of: try image(r: 0, g: 0, b: 255, bgra: true), x: 1, y: 1))
        XCTAssertEqual(rgba, 0.114, accuracy: 0.01)
        XCTAssertEqual(bgra, 0.114, accuracy: 0.01)
    }

    /// 12.67: when the heading leaves the tree the position falls back to another text, never NaN.
    func testScrollMarkFallsBackToTheFirstText() {
        let texts: [(label: String, minY: CGFloat)] = [("", 10), ("Dining out", 40), ("Your money's health", -20)]
        XCTAssertEqual(Launch.scrollMark(probe: "Your money's health", texts: texts),
                       ScrollMark(label: "Your money's health", y: -20))
        XCTAssertEqual(Launch.scrollMark(probe: "What moved it", texts: texts), ScrollMark(label: "Dining out", y: 40))
        XCTAssertNil(Launch.scrollMark(probe: "What moved it", texts: []))
        // Two readings with nothing to go on are "the same", so settling ends instead of timing out.
        XCTAssertEqual(Launch.scrollMark(probe: "x", texts: []), Launch.scrollMark(probe: "x", texts: []))
    }
}
