import Testing
@testable import SpendozaKit

struct HouseholdCodeTests {
    @Test func normalizeStripsSpacesAndHyphensAndLowercases() {
        #expect(HouseholdCode.normalize(" abcde-FGHJK ") == "abcdefghjk")
        #expect(HouseholdCode.normalize("ab12cd34") == "ab12cd34")
        #expect(HouseholdCode.normalize("AB 12\tCD-34\n") == "ab12cd34")
    }

    @Test func normalizeDoesNotRemapLookAlikes() {
        #expect(HouseholdCode.normalize("O0Il1") == "o0il1")
    }

    @Test func formatHyphenatesOnlyTenCharacterCodes() {
        #expect(HouseholdCode.format("abcdefghjk") == "ABCDE-FGHJK")
        #expect(HouseholdCode.format("ab12cd34") == "AB12CD34")
        #expect(HouseholdCode.format("abcdefghjkm") == "ABCDEFGHJKM")
        #expect(HouseholdCode.format("") == "")
    }
}
