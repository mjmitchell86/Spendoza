import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

/// Counts the sleeps a poller asks for; each returns at once, so no test waits 5 seconds.
final class SleepLog: @unchecked Sendable {
    private let lock = NSLock()
    private var _durations: [Duration] = []
    var durations: [Duration] { lock.withLock { _durations } }
    var sleeper: @Sendable (Duration) async throws -> Void {
        { [self] duration in
            lock.withLock { _durations.append(duration) }
            await Task.yield()
        }
    }
}

@MainActor
struct StatementPollerTests {
    private let when = Date(timeIntervalSince1970: 1_792_000_000)

    private func statement(_ id: String, _ status: StatementStatus) -> Statement {
        Statement(id: id, status: status, fileType: "pdf", createdAt: when)
    }

    @Test func pollsEveryFiveSecondsWhileProcessingThenStops() async {
        let api = StubAPI()
        api.statementScript = [[statement("s1", .processing)], [statement("s1", .processing)], [statement("s1", .parsed)]]
        let log = SleepLog()
        let poller = StatementPoller(api: api, sleep: log.sleeper)
        await poller.refresh()
        #expect(poller.isPolling)
        await poller.waitUntilIdle()
        #expect(log.durations == [.seconds(5), .seconds(5)])
        #expect(api.calls.filter { $0 == "statements" }.count == 3)
        #expect(poller.statements.map(\.status) == [.parsed])
        #expect(!poller.isPolling)
        #expect(!poller.isProcessing)
    }

    @Test func doesNotPollWhenNothingIsProcessing() async {
        let api = StubAPI()
        api.statementScript = [[statement("s1", .parsed), statement("s2", .failed)]]
        let log = SleepLog()
        let poller = StatementPoller(api: api, sleep: log.sleeper)
        await poller.refresh()
        #expect(!poller.isPolling)
        #expect(log.durations.isEmpty)
        #expect(api.calls.filter { $0 == "statements" }.count == 1)
    }

    @Test func anUploadedStatementCountsAsWorking() async {
        let api = StubAPI()
        api.statementScript = [[statement("s1", .uploaded)], [statement("s1", .parsed)]]
        let poller = StatementPoller(api: api, sleep: SleepLog().sleeper)
        await poller.refresh()
        #expect(poller.isPolling)
        await poller.waitUntilIdle()
        #expect(poller.statements.map(\.status) == [.parsed])
    }

    @Test func resumesWhenARefreshFindsSomethingProcessing() async {
        let api = StubAPI()
        api.statementScript = [[statement("s1", .parsed)], [statement("s1", .parsed), statement("s2", .processing)],
                               [statement("s1", .parsed), statement("s2", .parsed)]]
        let log = SleepLog()
        let poller = StatementPoller(api: api, sleep: log.sleeper)
        await poller.refresh()
        #expect(!poller.isPolling)
        // An upload happened: the screen refreshes.
        await poller.refresh()
        #expect(poller.isPolling)
        await poller.waitUntilIdle()
        #expect(log.durations == [.seconds(5)])
        #expect(poller.statements.map(\.status) == [.parsed, .parsed])
    }

    @Test func aDroppedConnectionKeepsPolling() async {
        let api = StubAPI()
        api.statementScript = [[statement("s1", .processing)], [statement("s1", .parsed)]]
        let poller = StatementPoller(api: api, sleep: SleepLog().sleeper)
        await poller.refresh()
        api.statementFailures = 1
        await poller.waitUntilIdle()
        #expect(poller.statements.map(\.status) == [.parsed])
        #expect(poller.loadError == nil)
    }

    @Test func stopCancelsAPollInFlight() async {
        let api = StubAPI()
        api.statementScript = [[statement("s1", .processing)]]
        let poller = StatementPoller(api: api, sleep: { _ in try await Task.sleep(for: .seconds(3600)) })
        await poller.refresh()
        #expect(poller.isPolling)
        poller.stop()
        #expect(!poller.isPolling)
        await poller.waitUntilIdle()
        #expect(api.calls.filter { $0 == "statements" }.count == 1)
    }

    @Test func anEndedSessionStopsPollingAndSaysSo() async {
        let api = StubAPI()
        api.statementScript = [[statement("s1", .processing)]]
        let poller = StatementPoller(api: api, sleep: SleepLog().sleeper)
        var ended = 0
        poller.onSessionEnded = { ended += 1 }
        await poller.refresh()
        #expect(poller.isPolling)
        api.statementError = .unauthorized
        await poller.waitUntilIdle()
        #expect(ended == 1)
        #expect(!poller.isPolling)
    }
}
