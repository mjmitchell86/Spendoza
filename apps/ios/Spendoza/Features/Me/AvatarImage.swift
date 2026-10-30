import ImageIO
import SwiftUI
import UniformTypeIdentifiers

/// Preparing a picked photo for upload, and the stand-in shown when there is none.
enum AvatarImage {
    /// The photo as JPEG with its longest side at most `maxPixel` (never enlarged), orientation applied. Reads through
    /// ImageIO's thumbnailer, so HEIC and big originals never become a full-size bitmap. Nil when the data isn't an image.
    static func jpegForUpload(_ data: Data, maxPixel: Int = 512, quality: Double = 0.85) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil)
        else { return nil }
        CGImageDestinationAddImage(destination, image,
                                   [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }

    /// Up to two capital letters, from the first two words; "?" for an empty name.
    static func initials(_ name: String) -> String {
        let letters = name.split(whereSeparator: \.isWhitespace).prefix(2).compactMap(\.first)
        return letters.isEmpty ? "?" : String(letters).uppercased()
    }
}

/// The round photo: the picture when there is one, else initials on a card.
struct AvatarCircle: View {
    let name: String
    let url: URL?
    var size: CGFloat = 84
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        ZStack {
            Theme.card
            if let url {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        initials
                    }
                }
            } else {
                initials
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Theme.engraving, lineWidth: Theme.hairline(displayScale: displayScale)))
    }

    private var initials: some View {
        Text(AvatarImage.initials(name))
            .font(.serif(size * 0.36, relativeTo: .title))
            .foregroundStyle(Theme.note)
    }
}
