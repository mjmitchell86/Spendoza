import Testing
@testable import SpendozaKit

@Suite struct DialGeometryTests {
    private let oct = Month(year: 2026, month: 10)

    @Test func anglesSweepFromLeftToRight() {
        #expect(DialGeometry.angle(forScore: 0) == 180)
        #expect(DialGeometry.angle(forScore: 50) == 90)
        #expect(abs(DialGeometry.angle(forScore: 64) - 64.8) < 0.0001)
        #expect(DialGeometry.angle(forScore: 100) == 0)
    }

    @Test func scoresClampToZeroThroughOneHundred() {
        #expect(DialGeometry.angle(forScore: -20) == 180)
        #expect(DialGeometry.angle(forScore: 150) == 0)
    }

    @Test func bandStopsCoverEveryScoreOnce() {
        let stops = DialGeometry.bandStops
        #expect(stops.map(\.0) == [.low, .fair, .good])
        #expect(stops.map(\.1) == [0...39, 40...69, 70...100])
        for score in 0...100 {
            #expect(stops.filter { $0.1.contains(score) }.map(\.0) == [ScoreBand(score: score)])
        }
    }

    @Test func labelWhenDown() {
        #expect(dialAccessibilityLabel(score: 64, previous: 73, month: oct) == "Health score 64 of 100, Fair, down 9 since September.")
    }

    @Test func labelWhenUp() {
        #expect(dialAccessibilityLabel(score: 75, previous: 70, month: oct) == "Health score 75 of 100, Good, up 5 since September.")
    }

    @Test func labelWhenUnchanged() {
        #expect(dialAccessibilityLabel(score: 70, previous: 70, month: oct) == "Health score 70 of 100, Good, same as September.")
    }

    @Test func labelWithoutPreviousScore() {
        #expect(dialAccessibilityLabel(score: 64, previous: nil, month: oct) == "Health score 64 of 100, Fair.")
    }

    @Test func labelClampsScores() {
        #expect(dialAccessibilityLabel(score: 120, previous: nil, month: oct) == "Health score 100 of 100, Good.")
    }

    @Test func labelAcrossNewYear() {
        let jan = Month(year: 2027, month: 1)
        #expect(dialAccessibilityLabel(score: 30, previous: 45, month: jan) == "Health score 30 of 100, Low, down 15 since December.")
    }
}
