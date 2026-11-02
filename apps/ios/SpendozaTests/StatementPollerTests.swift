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

/// Holds callers until `open()`.
final class Gate: @unchecked Sendable {
    private let lock = NSLock()
    private var isOpen = false
    private var waiting: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        await withCheckedContinuation { continuation in
            let resume = lock.withLock { () -> Bool in
                if !isOpen { waiting.append(continuation) }
                return isOpen
            }
            if resume { continuation.resume() }
        }
    }

    func open() {
        let toResume = lock.withLock { () -> [CheckedContinuation<Void, Never>] in
            isOpen = true
            defer { waiting = [] }
            return waiting
        }
        toResume.forEach { $0.resume() }
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

    @Test func aStatementFinishingIsCountedOnceSoTheMoneyScreensReload() async {
        let api = StubAPI()
        api.statementScript = [[statement("s1", .parsed), statement("s2", .processing), statement("s3", .uploaded)],
                               [statement("s1", .parsed), statement("s2", .parsed), statement("s3", .processing)],
                               [statement("s1", .parsed), statement("s2", .parsed), statement("s3", .failed)],
                               [statement("s1", .parsed), statement("s2", .parsed), statement("s3", .failed)]]
        let poller = StatementPoller(api: api, sleep: SleepLog().sleeper)
        await poller.refresh()
        // Already parsed when first seen: nothing new to show.
        #expect(poller.finishedCount == 0)
        await poller.waitUntilIdle()
        // s2 finished; s3 failing brings no new transactions.
        #expect(poller.finishedCount == 1)
        await poller.refresh()
        #expect(poller.finishedCount == 1)
    }

    @Test func aStatementThatFinishesBetweenRefreshesCountsToo() async {
        let api = StubAPI()
        api.statementScript = [[statement("s1", .failed)], [statement("s1", .parsed), statement("s2", .parsed)]]
        let poller = StatementPoller(api: api, sleep: SleepLog().sleeper)
        await poller.refresh()
        // s1 retried and s2 uploaded on the web, both parsed by the next look.
        await poller.refresh()
        #expect(poller.finishedCount == 2)
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

    @Test func aRefreshFinishingAfterStopDoesNotStartPolling() async {
        let api = StubAPI()
        api.statementScript = [[statement("s1", .processing)]]
        let gate = Gate()
        api.statementsHook = { await gate.wait() }
        let log = SleepLog()
        let poller = StatementPoller(api: api, sleep: log.sleeper)
        let refreshing = Task { await poller.refresh() }
        while !api.calls.contains("statements") { await Task.yield() }
        // Sign-out: the screens go away while the fetch is still in flight.
        poller.stop()
        gate.open()
        await refreshing.value
        #expect(!poller.isPolling)
        await poller.waitUntilIdle()
        #expect(log.durations.isEmpty)
        #expect(api.calls.filter { $0 == "statements" }.count == 1)
        // A later refresh on the stopped poller does nothing more either.
        await poller.refresh()
        #expect(!poller.isPolling)
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
