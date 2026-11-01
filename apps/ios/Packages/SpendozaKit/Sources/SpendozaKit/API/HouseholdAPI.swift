import Foundation

/// The household's server calls. Failures carry the server's text (`APIError.message`); a plan refusal is `.notOnPlan`.
public protocol HouseholdAPI: Sendable {
    /// `nil` when the caller is in no household (404).
    func household() async throws -> Household?
    /// Creates the household and returns its first invite code (raw).
    func createHousehold(name: String) async throws -> String?
    func joinHousehold(code: String) async throws
    /// A fresh code, raw (lowercase), replacing the old one.
    func rotateInviteCode() async throws -> String
    func renameHousehold(_ name: String) async throws
    /// `confirmName` must match the household's name exactly.
    func deleteHousehold(confirmName: String) async throws
    func invite(email: String) async throws
    func pendingInvitations() async throws -> [PendingInvitation]
    func revokeInvitation(id: String) async throws
    func myInvitations() async throws -> [MyInvitation]
    /// `code` is the invitation code from the email.
    func acceptInvitation(id: String, code: String) async throws
    func declineInvitation(id: String, code: String) async throws
    func removeMember(id: String) async throws
    /// Transfers head of household to a member.
    func makeHead(id: String) async throws
    func updateSharing(_ change: SharingChange) async throws
    /// Shares or unshares one category with the household (category sharing mode).
    func setCategoryShared(id: String, shared: Bool) async throws
    func leaveHousehold() async throws
}
