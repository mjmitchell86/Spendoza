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
    /// Invitations whose last accept or decline the server refused for the plan; each shows the plan notice.
    private(set) var planRefused: Set<String> = []

    @ObservationIgnored private let api: any SpendozaAPI
    /// Read at each load: the signed-in profile can change after this model was made.
    @ObservationIgnored private let selfID: @MainActor () -> String?
    /// Called after the person created, joined or accepted into a household (sign-up's notice is stale then).
    @ObservationIgnored private let householdChanged: @MainActor () -> Void
    /// Bumped by every load; a load that finds it has moved on drops its result.
    @ObservationIgnored private var generation = 0

    init(api: any SpendozaAPI, selfID: @escaping @MainActor () -> String?,
         householdChanged: @escaping @MainActor () -> Void = {}) {
        self.api = api
        self.selfID = selfID
        self.householdChanged = householdChanged
    }

    func load() async {
        generation += 1
        let mine = generation
        do {
            if let household = try await api.household() {
                guard mine == generation else { return }
                state = .member(household, isHead: household.headID == selfID())
            } else {
                // The list is a convenience: if it can't load, Create and Join still work.
                let invitations = (try? await api.myInvitations()) ?? []
                guard mine == generation else { return }
                state = .none(invitations: invitations)
            }
        } catch APIError.notOnPlan {
            guard mine == generation else { return }
            state = .notOnPlan
        } catch {
            guard mine == generation else { return }
            state = .failed(Self.message(error, fallback: "Failed to load household"))
        }
    }

    func accept(_ invitation: MyInvitation, code: String) async {
        let done = await respond(to: invitation, fallback: "Failed to accept invitation") {
            try await $0.acceptInvitation(id: invitation.id, code: HouseholdCode.normalize(code))
        }
        if done { householdChanged() }
    }

    func decline(_ invitation: MyInvitation, code: String) async {
        _ = await respond(to: invitation, fallback: "Failed to decline invitation") {
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
        householdChanged()
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
        householdChanged()
        await load()
    }

    /// True when the call went through. A plan refusal stays with that invitation; Decline, Create and Join remain.
    private func respond(to invitation: MyInvitation, fallback: String,
                         _ call: (any SpendozaAPI) async throws -> Void) async -> Bool {
        guard busyInvitationID == nil else { return false }
        busyInvitationID = invitation.id
        invitationErrors[invitation.id] = nil
        planRefused.remove(invitation.id)
        defer { busyInvitationID = nil }
        do {
            try await call(api)
        } catch APIError.notOnPlan {
            planRefused.insert(invitation.id)
            return false
        } catch {
            invitationErrors[invitation.id] = Self.message(error, fallback: fallback)
            return false
        }
        await load()
        return true
    }

    private static func message(_ error: Error, fallback: String) -> String {
        (error as? APIError)?.userMessage ?? fallback
    }

    /// The sign-up notice for what is on screen: "You've joined" only once the household itself is shown.
    func signUpNotice(_ result: SignUpResult) -> String? {
        switch state {
        case .loading: return nil
        case .member(let household, _): return Self.signUpNotice(result, householdName: household.name)
        default: return result.joinedHousehold ? nil : Self.signUpNotice(result, householdName: nil)
        }
    }

    /// What sign-up says about the code that was entered; nil when there is nothing to say.
    static func signUpNotice(_ result: SignUpResult, householdName: String?) -> String? {
        if result.joinedHousehold { return "You've joined \(householdName ?? "the household")" }
        if result.householdFull { return "That household is full now" }
        if result.householdNotOnPlan { return "That household isn't available on your plan yet" }
        return nil
    }
}
