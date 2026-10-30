import Foundation

/// A Support or Privacy page, decoded from the JSON the web renders too (packages/shared/src/content).
struct LegalPage: Decodable {
    struct Section: Decodable {
        let heading: String
        let blocks: [Block]
    }

    enum Block: Decodable {
        case p(String)
        case ol([String])
        case ul([String])

        private enum Key: String, CodingKey { case p, ol, ul }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: Key.self)
            if let p = try c.decodeIfPresent(String.self, forKey: .p) { self = .p(p) }
            else if let ol = try c.decodeIfPresent([String].self, forKey: .ol) { self = .ol(ol) }
            else if let ul = try c.decodeIfPresent([String].self, forKey: .ul) { self = .ul(ul) }
            else { throw DecodingError.dataCorrupted(.init(codingPath: c.codingPath, debugDescription: "Unknown block")) }
        }
    }

    let title: String
    let intro: [String]
    let effective: String?
    let sections: [Section]
    let footer: String

    static let siteURL = "https://www.spendoza.io"

    static func load(_ name: String, bundle: Bundle = .main) throws -> LegalPage {
        guard let url = bundle.url(forResource: name, withExtension: "json") else { throw CocoaError(.fileNoSuchFile) }
        return try JSONDecoder().decode(LegalPage.self, from: Data(contentsOf: url))
    }

    /// Inline `[text](href)` and `**bold**`; site paths like `/pricing` link to the website.
    static func attributed(_ text: String) -> AttributedString {
        var result = (try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)))
            ?? AttributedString(text)
        for run in result.runs {
            guard let link = run.link else { continue }
            result[run.range].underlineStyle = .single
            if link.scheme == nil, link.path.hasPrefix("/"), let site = URL(string: siteURL + link.absoluteString) {
                result[run.range].link = site
            }
        }
        return result
    }

    /// The Help screen a link inside a Help screen points at, or nil when it leaves the app.
    static func helpScreen(for url: URL) -> String? {
        guard url.absoluteString.hasPrefix(siteURL + "/") else { return nil }
        switch url.path {
        case "/support": return "support"
        case "/privacy": return "privacy"
        default: return nil
        }
    }
}
