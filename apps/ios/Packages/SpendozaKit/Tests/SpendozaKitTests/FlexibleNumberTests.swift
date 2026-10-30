import Foundation
import Testing
@testable import SpendozaKit

struct FlexibleNumberTests {
    private func decode(_ json: String) throws -> FlexibleNumber {
        try JSONDecoder().decode([FlexibleNumber].self, from: Data("[\(json)]".utf8))[0]
    }

    @Test func readsNumbersAndNumericStrings() throws {
        #expect(try decode("4").int == 4)
        #expect(try decode("\"1000.5000\"").double == 1000.5)
        #expect(try decode("\"1000.5000\"").int == 1001)
    }

    @Test(arguments: ["\"NaN\"", "\"Infinity\"", "\"-Infinity\"", "\"1e400\"", "\"9223372036854775808\"", "\"-1e19\""])
    func rejectsValuesAnIntCannotHold(_ json: String) {
        #expect(throws: DecodingError.self) { try decode(json) }
    }
}
