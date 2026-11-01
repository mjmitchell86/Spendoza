import Foundation
import Observation
import SpendozaKit

/// The Home tab: whether the signed-in user is in a household, their invitations when not, and the actions that
/// change that (create, join, accept, decline). Plans are not gated here; the server's 403 becomes `.notOnPlan`.
@Observable @MainActor
final class HomeModel {
    enum State: Equatable {
        case loading
        case none(invitations: [MyInvitation])
        case member(Household, isHead: Bool)
        case notOnPlan
        case failed(String)
    }

    private(set) var state: State = .loading
    /// The invitation being accepted or declined.
    private(set) var busyInvitationID: String?
    /// The last accept or decline failure, by invitation id, in the server's words.
    private(set) var invitationErrors: [String: String] = [:]

    @ObservationIgnored private let api: any SpendozaAPI
    @ObservationIgnored private let selfID: String?

    init(api: any SpendozaAPI, selfID: String?) {
        self.api = api
        self.selfID = selfID
    }

    func load() async {
        do {
            if let household = try await api.household() {
                state = .member(household, isHead: household.headID == selfID)
            } else {
                // The list is a convenience: if it can't load, Create and Join still work.
                let invitations = (try? await api.myInvitations()) ?? []
                state = .none(invitations: invitations)
            }
        } catch APIError.notOnPlan {
            state = .notOnPlan
        } catch {
            state = .failed(Self.message(error, fallback: "Failed to load household"))
        }
    }

    func accept(_ invitation: MyInvitation, code: String) async {
        await respond(to: invitation, fallback: "Failed to accept invitation") {
            try await $0.acceptInvitation(id: invitation.id, code: HouseholdCode.normalize(code))
        }
    }

    func decline(_ invitation: MyInvitation, code: String) async {
        await respond(to: invitation, fallback: "Failed to decline invitation") {
            try await $0.declineInvitation(id: invitation.id, code: HouseholdCode.normalize(code))
        }
    }

    /// Throws the server's error (the sheet shows it); on success the screen reloads into the household.
    func create(name: String) async throws {
        do {
            _ = try await api.createHousehold(name: name.trimmingCharacters(in: .whitespacesAndNewlines))
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.message("Failed to create household")
        }
        await load()
    }

    func join(code: String) async throws {
        do {
            try await api.joinHousehold(code: HouseholdCode.normalize(code))
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.message("Failed to join household")
        }
        await load()
    }

    private func respond(to invitation: MyInvitation, fallback: String,
                         _ call: (any SpendozaAPI) async throws -> Void) async {
        guard busyInvitationID == nil else { return }
        busyInvitationID = invitation.id
        invitationErrors[invitation.id] = nil
        defer { busyInvitationID = nil }
        do {
            try await call(api)
            await load()
        } catch APIError.notOnPlan {
            state = .notOnPlan
        } catch {
            invitationErrors[invitation.id] = Self.message(error, fallback: fallback)
        }
    }

    private static func message(_ error: Error, fallback: String) -> String {
        (error as? APIError)?.userMessage ?? fallback
    }

    /// What sign-up says about the code that was entered; nil when there is nothing to say.
    static func signUpNotice(_ result: SignUpResult, householdName: String?) -> String? {
        if result.joinedHousehold { return "You've joined \(householdName ?? "the household")" }
        if result.householdFull { return "That household is full now" }
        if result.householdNotOnPlan { return "That household isn't available on your plan yet" }
        return nil
    }
}
