import ImageIO
import Testing
import UIKit
@testable import Spendoza

struct AvatarImageTests {
    @Test func initialsOfTwoWords() { #expect(AvatarImage.initials("Matt Mitchell") == "MM") }
    @Test func initialsOfOneWord() { #expect(AvatarImage.initials("cher") == "C") }
    @Test func initialsOfNothing() {
        #expect(AvatarImage.initials("") == "?")
        #expect(AvatarImage.initials("   ") == "?")
    }
    @Test func initialsUseTheFirstTwoOfThreeWords() { #expect(AvatarImage.initials("Mary Jane Watson") == "MJ") }

    private func png(width: Int, height: Int) throws -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { ctx in
            UIColor.systemTeal.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
            UIColor.white.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: width / 2, height: height / 2))
        }
        return try #require(image.pngData())
    }

    private func pixelSize(_ jpeg: Data) throws -> (Int, Int) {
        let source = try #require(CGImageSourceCreateWithData(jpeg as CFData, nil))
        #expect(CGImageSourceGetType(source) as String? == "public.jpeg")
        let image = try #require(CGImageSourceCreateImageAtIndex(source, 0, nil))
        return (image.width, image.height)
    }

    @Test func aLargePhotoIsScaledToFiveTwelveOnItsLongestSide() throws {
        let jpeg = try #require(AvatarImage.jpegForUpload(try png(width: 4032, height: 3024)))
        let (w, h) = try pixelSize(jpeg)
        #expect(w == 512)
        #expect(h == 384)
        #expect(jpeg.count < 5_000_000)
    }

    @Test func aSmallPhotoIsNotEnlarged() throws {
        let jpeg = try #require(AvatarImage.jpegForUpload(try png(width: 300, height: 200)))
        let (w, h) = try pixelSize(jpeg)
        #expect(w == 300)
        #expect(h == 200)
    }

    @Test func dataThatIsNotAnImageGivesNil() { #expect(AvatarImage.jpegForUpload(Data("nope".utf8)) == nil) }
}
