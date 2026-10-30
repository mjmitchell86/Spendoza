import Observation
import SpendozaKit

/// Deleting the signed-in account: the confirmation word, the call, and what to say when the server refuses.
@Observable @MainActor
final class DeleteAccountModel: Identifiable {
    static let confirmation = "DELETE"

    var typed = ""
    private(set) var deleting = false
    /// The server's reason (a household head must hand over first), or a plain failure line.
    var error: String?

    @ObservationIgnored private let api: any SpendozaAPI
    @ObservationIgnored private let onDeleted: @MainActor () async -> Void

    init(api: any SpendozaAPI, onDeleted: @escaping @MainActor () async -> Void) {
        self.api = api
        self.onDeleted = onDeleted
    }

    /// Case-sensitive and exact: no trimming.
    var canDelete: Bool { typed == Self.confirmation }

    func delete() async {
        guard canDelete, !deleting else { return }
        error = nil
        deleting = true
        defer { deleting = false }
        do {
            try await api.deleteAccount()
        } catch {
            let text = (error as? APIError)?.userMessage ?? ""
            self.error = text.isEmpty ? "Failed to delete account" : text
            return
        }
        await onDeleted()
    }
}
