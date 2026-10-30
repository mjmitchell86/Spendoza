import Foundation
import Observation
import SpendozaKit

/// Disconnecting AI assistants: ends every other session. This phone's own session stays (the server keeps the caller's).
@Observable @MainActor
final class AIAssistantsModel {
    enum State: Equatable { case idle, disconnecting, done, failed(String) }

    static let doneMessage = "AI assistants and other sessions disconnected"

    private(set) var state: State = .idle

    @ObservationIgnored private let api: any SpendozaAPI

    init(api: any SpendozaAPI) { self.api = api }

    func disconnect() async {
        guard state != .disconnecting else { return }
        state = .disconnecting
        do {
            try await api.signOutOtherSessions()
            state = .done
        } catch {
            state = .failed((error as? APIError)?.userMessage ?? "Failed to disconnect other sessions. Please try again.")
        }
    }
}
