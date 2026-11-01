import Foundation
import Observation
import SpendozaKit

/// Managing the household you are in: the invite code, invitations, members, rename, delete and leave.
/// `household` is what the Home tab last fetched; every change that alters it asks `reload` to fetch it again.
@Observable @MainActor
final class HouseholdModel {
    /// What is in progress; one thing at a time.
    enum Working: Equatable {
        case rotating, inviting, renaming, deleting, leaving
        case removing(String), transferring(String), revoking(String)
    }

    enum InviteResult: Equatable {
        case sent
        case failed(String)
    }

    private(set) var household: Household
    private(set) var inviteCode: String?
    private(set) var working: Working?
    private(set) var pending: [PendingInvitation] = []
    private(set) var inviteResult: InviteResult?
    /// The last failure of each area, in the server's words.
    private(set) var codeError: String?
    private(set) var memberError: String?
    private(set) var pendingError: String?
    private(set) var settingsError: String?
    private(set) var leaveError: String?

    @ObservationIgnored private let api: any SpendozaAPI
    /// Read at the moment it is needed: the signed-in profile can change under a long-lived screen.
    @ObservationIgnored private let selfID: @MainActor () -> String?
    @ObservationIgnored private let reload: @MainActor () async -> Void

    init(api: any SpendozaAPI, selfID: @escaping @MainActor () -> String?, household: Household,
         reload: @escaping @MainActor () async -> Void) {
        self.api = api
        self.selfID = selfID
        self.household = household
        self.inviteCode = household.inviteCode
        self.reload = reload
    }

    var isHead: Bool { household.headID == selfID() }

    /// A freshly fetched household replaces what is shown (the code too: removing a member rotates it).
    func sync(_ household: Household) {
        self.household = household
        inviteCode = household.inviteCode
    }

    // MARK: Invite code

    static let rotateTitle = "Get a new code?"
    static let rotateBody = "Anyone who has the old code won't be able to use it. People already in your household stay."
    static let inviteFallback = "Couldn't send the invitation email. Try again."

    /// The code as shown and copied (`ABCDE-FGHJK`); only the head has one.
    var codeText: String? {
        guard isHead, let inviteCode, !inviteCode.isEmpty else { return nil }
        return HouseholdCode.format(inviteCode)
    }

    /// Text only, as the web shares it.
    static func shareText(code: String) -> String { "Join my household on Spendoza with code \(code)" }

    func rotateCode() async {
        await perform(.rotating, error: \.codeError, fallback: "Failed to generate a new code") {
            self.inviteCode = try await $0.rotateInviteCode()
        }
    }

    // MARK: Members

    static func removeBody(_ member: Member) -> String {
        "Remove \(member.displayName) from the household? Your invite code will change."
    }

    static func transferBody(_ member: Member) -> String {
        "Make \(member.displayName) the head of household? You will no longer be the head of household."
    }

    var sortedMembers: [Member] {
        household.members.sorted { $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending }
    }

    func title(for member: Member) -> String {
        var text = member.displayName
        if member.id == household.headID { text += " (Head)" }
        if member.id == selfID() { text += " (You)" }
        return text
    }

    static func sharingLine(_ member: Member) -> String {
        let income = switch member.incomeSharing {
        case .all: "All"
        case .none: "None"
        case .partial: "Partial"
        }
        let expenses = switch member.expenseSharing {
        case .all: "All"
        case .none: "None"
        case .category: "By category"
        }
        return "Income: \(income) · Expenses: \(expenses)"
    }

    func remove(_ member: Member) async {
        await perform(.removing(member.id), error: \.memberError, fallback: "Failed to remove member") {
            try await $0.removeMember(id: member.id)
            await self.reload()
        }
    }

    func makeHead(_ member: Member) async {
        await perform(.transferring(member.id), error: \.memberError, fallback: "Failed to transfer") {
            try await $0.makeHead(id: member.id)
            await self.reload()
        }
    }

    // MARK: Invitations

    /// Clears the "Invitation sent" line when the address is edited.
    func clearInviteResult() { inviteResult = nil }

    func sendInvitation(email: String) async {
        guard working == nil else { return }
        working = .inviting
        inviteResult = nil
        defer { working = nil }
        do {
            try await api.invite(email: email.trimmingCharacters(in: .whitespacesAndNewlines))
            inviteResult = .sent
        } catch {
            inviteResult = .failed(Self.message(error, fallback: Self.inviteFallback))
            return
        }
        await fetchPending()
    }

    func loadPending() async {
        guard isHead else { pending = []; return }
        await fetchPending()
    }

    private func fetchPending() async {
        guard isHead else { return }
        do {
            pending = try await api.pendingInvitations()
        } catch {
            pendingError = Self.message(error, fallback: "Failed to load invitations")
        }
    }

    func revoke(_ invitation: PendingInvitation) async {
        await perform(.revoking(invitation.id), error: \.pendingError, fallback: "Failed to revoke invitation") {
            try await $0.revokeInvitation(id: invitation.id)
            self.pending = try await $0.pendingInvitations()
        }
    }

    // MARK: Settings

    func canRename(_ draft: String) -> Bool {
        let name = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        return !name.isEmpty && name != household.name
    }

    func rename(to draft: String) async {
        let name = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        await perform(.renaming, error: \.settingsError, fallback: "Failed to rename household") {
            try await $0.renameHousehold(name)
            await self.reload()
        }
    }

    /// Exact: no trimming, no case folding.
    static func canDelete(typed: String, name: String) -> Bool { !name.isEmpty && typed == name }

    /// True when the household is gone.
    func deleteHousehold(typed: String) async -> Bool {
        guard Self.canDelete(typed: typed, name: household.name) else { return false }
        let name = household.name
        await perform(.deleting, error: \.settingsError, fallback: "Failed to delete household") {
            try await $0.deleteHousehold(confirmName: name)
            await self.reload()
        }
        return settingsError == nil
    }

    func clearSettingsError() { settingsError = nil }

    // MARK: Leave

    struct LeavePlan: Equatable {
        let rowTitle: String
        let buttonTitle: String
        let subtext: String
        let dialogTitle: String
        let dialogBody: String
        let isDisabled: Bool
    }

    var leave: LeavePlan {
        let alone = household.members.count <= 1
        if isHead && !alone {
            return LeavePlan(rowTitle: "Leave household", buttonTitle: "Leave household",
                             subtext: "Transfer ownership before leaving", dialogTitle: "Leave household",
                             dialogBody: "Are you sure you want to leave \(household.name)?", isDisabled: true)
        }
        if isHead {
            return LeavePlan(rowTitle: "Leave & delete household", buttonTitle: "Leave & delete",
                             subtext: "This will permanently delete the household",
                             dialogTitle: "Leave & delete household",
                             dialogBody: "Are you sure you want to leave \(household.name)? Since you are the only member, the household will be permanently deleted.",
                             isDisabled: false)
        }
        return LeavePlan(rowTitle: "Leave household", buttonTitle: "Leave household",
                         subtext: "You will be removed from this household", dialogTitle: "Leave household",
                         dialogBody: "Are you sure you want to leave \(household.name)?", isDisabled: false)
    }

    func leaveHousehold() async {
        await perform(.leaving, error: \.leaveError, fallback: "Failed to leave household") {
            try await $0.leaveHousehold()
            await self.reload()
        }
    }

    // MARK: Plumbing

    /// Runs one action: clears the area's error, shows the server's words (or the fallback) when it fails.
    private func perform(_ action: Working, error area: ReferenceWritableKeyPath<HouseholdModel, String?>,
                         fallback: String, _ call: (any SpendozaAPI) async throws -> Void) async {
        guard working == nil else { return }
        working = action
        self[keyPath: area] = nil
        defer { working = nil }
        do {
            try await call(api)
        } catch {
            self[keyPath: area] = Self.message(error, fallback: fallback)
        }
    }

    private static func message(_ error: Error, fallback: String) -> String {
        (error as? APIError)?.userMessage ?? fallback
    }
}
