import Foundation
import Testing
@testable import Spendoza

@MainActor
struct LegalPageTests {
    @Test func bothBundledFilesLoad() throws {
        let support = try LegalPage.load("support")
        let privacy = try LegalPage.load("privacy")
        #expect(support.title == "Support")
        #expect(privacy.title == "Privacy Policy")
        #expect(!support.footer.isEmpty)
    }

    @Test func supportHasItsSections() throws {
        let support = try LegalPage.load("support")
        #expect(support.sections.contains { $0.heading == "If a statement fails" })
        let how = try #require(support.sections.first { $0.heading == "How it works" })
        guard case .ol(let steps)? = how.blocks.first else { Issue.record("expected an ordered list"); return }
        #expect(steps.count == 5)
    }

    @Test func privacyHasItsEffectiveDate() throws {
        #expect(try LegalPage.load("privacy").effective == "October 29, 2026")
    }

    @Test func mailtoLinkIsKept() {
        let text = LegalPage.attributed("email [hello@gravitaz.net](mailto:hello@gravitaz.net)")
        #expect(text.runs.compactMap(\.link) == [URL(string: "mailto:hello@gravitaz.net")!])
    }

    @Test func sitePathsBecomeSiteURLs() {
        let text = LegalPage.attributed("the [pricing page](/pricing)")
        #expect(text.runs.compactMap(\.link) == [URL(string: "https://www.spendoza.io/pricing")!])
    }

    @Test func boldIsKeptAndMarkupRemoved() {
        let text = LegalPage.attributed("a **bold** word")
        #expect(String(text.characters) == "a bold word")
        #expect(text.runs.contains { $0.inlinePresentationIntent == .stronglyEmphasized })
    }

    @Test func helpLinksSwitchScreens() {
        #expect(LegalPage.helpScreen(for: URL(string: "https://www.spendoza.io/support")!) == "support")
        #expect(LegalPage.helpScreen(for: URL(string: "https://www.spendoza.io/privacy")!) == "privacy")
        #expect(LegalPage.helpScreen(for: URL(string: "https://www.spendoza.io/pricing")!) == nil)
        #expect(LegalPage.helpScreen(for: URL(string: "mailto:hello@gravitaz.net")!) == nil)
    }
}
