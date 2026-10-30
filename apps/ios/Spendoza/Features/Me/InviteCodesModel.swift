import Foundation
import Observation
import SpendozaKit

/// The signed-in user's invite codes (at most three, used ones included) and creating the next one.
@Observable @MainActor
final class InviteCodesModel {
    static let limit = 3

    private(set) var codes: [InviteCode] = []
    private(set) var loaded = false
    private(set) var creating = false
    /// The last failure, in words for the screen; cleared when the next load or create starts.
    var error: String?

    @ObservationIgnored private let api: any SpendozaAPI

    init(api: any SpendozaAPI) { self.api = api }

    var canCreate: Bool { codes.count < Self.limit }
    var footer: String { "\(codes.count) of \(Self.limit) codes created" }

    func load() async {
        error = nil
        do {
            codes = try await api.inviteCodes()
            loaded = true
        } catch {
            self.error = Self.message(error, fallback: "Couldn't load your invite codes. Try again.")
        }
    }

    func create() async {
        guard !creating else { return }
        error = nil
        creating = true
        defer { creating = false }
        do {
            codes.insert(try await api.createInviteCode(), at: 0)
        } catch {
            self.error = Self.message(error, fallback: "Couldn't create a code. Try again.")
        }
    }

    static func shareText(_ code: String) -> String {
        "Join me on Spendoza with invite code \(code): https://www.spendoza.io/signup"
    }

    private static func message(_ error: Error, fallback: String) -> String {
        (error as? APIError)?.userMessage ?? fallback
    }
}
