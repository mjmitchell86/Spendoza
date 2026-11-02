import Foundation
import Observation
import SpendozaKit

/// The one place `GET /api/bank-statements` is polled (the API allows 100 requests per 15 minutes per IP). Polls
/// every 5 seconds while a statement is uploaded or processing and stops when none is; `refresh()` (an upload, a
/// retry, opening a screen) starts it again. Overview and the Statements screen both read `statements` from here.
@MainActor @Observable
final class StatementPoller {
    nonisolated static let interval = Duration.seconds(5)

    private(set) var statements: [Statement] = []
    private(set) var hasLoaded = false
    /// Why the last fetch failed; cleared by the next one that works.
    private(set) var loadError: String?

    @ObservationIgnored var onSessionEnded: (@MainActor () -> Void)?
    @ObservationIgnored var onAccountDisabled: (@MainActor (String) -> Void)?
    @ObservationIgnored private let api: any SpendozaAPI
    @ObservationIgnored private let interval: Duration
    @ObservationIgnored private let sleep: @Sendable (Duration) async throws -> Void
    @ObservationIgnored private var loop: Task<Void, Never>?
    /// `stop()` is final: a refresh still in flight when the session ended must not start polling again.
    @ObservationIgnored private var isStopped = false

    init(api: any SpendozaAPI, interval: Duration = StatementPoller.interval,
         sleep: @escaping @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) }) {
        self.api = api
        self.interval = interval
        self.sleep = sleep
    }

    /// Something is still being read.
    var isProcessing: Bool { statements.contains { $0.status == .uploaded || $0.status == .processing } }

    /// Whether the polling loop is running (it ends by itself when nothing is processing).
    var isPolling: Bool { loop != nil }

    /// Fetches the list now, then keeps polling while something is processing.
    func refresh() async {
        await fetch()
        ensurePolling()
    }

    /// Ends polling for good (sign-out, the signed-in screens went away).
    func stop() {
        isStopped = true
        loop?.cancel()
        loop = nil
    }

    /// Resolves when the polling loop has ended; for tests.
    func waitUntilIdle() async { await loop?.value }

    private func ensurePolling() {
        guard !isStopped, !Task.isCancelled, loop == nil, isProcessing else { return }
        loop = Task { [weak self] in await self?.run() }
    }

    private func run() async {
        while isProcessing, !Task.isCancelled {
            do { try await sleep(interval) } catch { break }
            if Task.isCancelled { break }
            await fetch()
        }
        // After `stop()` a newer loop may already own `loop`; only clear it when this one ran to its end.
        if !Task.isCancelled { loop = nil }
    }

    private func fetch() async {
        do {
            let latest = try await api.statements()
            if Task.isCancelled { return }
            statements = latest
            loadError = nil
            hasLoaded = true
        } catch let error as APIError {
            switch error {
            case .unauthorized:
                stop()
                onSessionEnded?()
            case .accountDisabled(let text):
                stop()
                onAccountDisabled?(text)
            default:
                loadError = error.userMessage
                hasLoaded = true
            }
        } catch {
            loadError = "Couldn't load your statements. Try again."
            hasLoaded = true
        }
    }
}
