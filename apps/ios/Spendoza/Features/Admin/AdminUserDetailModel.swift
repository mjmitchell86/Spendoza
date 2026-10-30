import Observation
import SpendozaKit

/// What an admin can run on a user besides changing their settings.
enum AdminAction: CaseIterable, Hashable {
    case regenerateReport, detectRecurring, sendQuarterlyReport, sendAnnualReport

    var title: String {
        switch self {
        case .regenerateReport: "Refresh report"
        case .detectRecurring: "Detect recurring"
        case .sendQuarterlyReport: "Send quarterly report"
        case .sendAnnualReport: "Send annual report"
        }
    }
}

/// One user on the admin screen: tier, Admin and Disabled changes (applied at once, put back on failure),
/// the report actions and deleting.
@Observable @MainActor
final class AdminUserDetailModel {
    /// What an action said, shown under its row.
    struct Result: Equatable {
        let text: String
        let failed: Bool
    }

    private(set) var user: AdminUser
    let isSelf: Bool
    private(set) var results: [AdminAction: Result] = [:]
    private(set) var running: AdminAction?
    private(set) var deleting = false
    private(set) var deleted = false
    /// The last failure of a change or delete, in words for the screen.
    private(set) var error: String?

    @ObservationIgnored private let api: any SpendozaAPI
    @ObservationIgnored private let onChange: (AdminUser) -> Void
    @ObservationIgnored private let onDeleted: () -> Void

    init(user: AdminUser, api: any SpendozaAPI, isSelf: Bool,
         onChange: @escaping (AdminUser) -> Void, onDeleted: @escaping () -> Void) {
        self.user = user
        self.api = api
        self.isSelf = isSelf
        self.onChange = onChange
        self.onDeleted = onDeleted
    }

    /// The server refuses deleting yourself (400), so the screen doesn't offer it.
    var canDelete: Bool { !isSelf }

    var confirmation: String {
        let who = user.email.map { "\(user.displayName) (\($0))" } ?? user.displayName
        return "This will permanently delete \(who) and all their data. This cannot be undone."
    }

    func setTier(_ tier: String) async {
        guard tier != user.tier else { return }
        await change(AdminUserChange(tier: tier)) { $0.with(tier: tier) }
    }

    func setAdmin(_ value: Bool) async {
        guard value != user.isAdmin else { return }
        await change(AdminUserChange(isAdmin: value)) { $0.with(isAdmin: value) }
    }

    func setDisabled(_ value: Bool) async {
        guard value != user.disabled else { return }
        await change(AdminUserChange(disabled: value)) { $0.with(disabled: value) }
    }

    private func change(_ change: AdminUserChange, _ apply: (AdminUser) -> AdminUser) async {
        let before = user
        error = nil
        user = apply(before)
        do {
            try await api.adminUpdateUser(id: before.id, change)
            onChange(user)
        } catch {
            user = before
            self.error = Self.message(error, fallback: "Couldn't update this user. Try again.")
        }
    }

    /// Runs the action and returns the web's toast line for it; the line also shows under the action's row.
    @discardableResult
    func run(_ action: AdminAction) async -> String {
        guard running == nil else { return results[action]?.text ?? "" }
        running = action
        defer { running = nil }
        let name = user.displayName
        let outcome: Result
        do {
            switch action {
            case .regenerateReport:
                try await api.adminRegenerateReport(userID: user.id)
                outcome = Result(text: "Report regenerated for \(name)", failed: false)
            case .detectRecurring:
                try await api.adminDetectRecurring(userID: user.id)
                outcome = Result(text: "Recurring detection complete for \(name)", failed: false)
            case .sendQuarterlyReport:
                try await api.adminSendQuarterlyReport(userID: user.id)
                outcome = Result(text: "Quarterly report sent to \(name)", failed: false)
            case .sendAnnualReport:
                try await api.adminSendAnnualReport(userID: user.id)
                outcome = Result(text: "Annual report sent to \(name)", failed: false)
            }
        } catch {
            let reason = Self.message(error, fallback: "Try again.")
            switch action {
            case .regenerateReport: outcome = Result(text: "Failed to regenerate report for \(name)", failed: true)
            case .detectRecurring: outcome = Result(text: "Failed to detect recurring for \(name)", failed: true)
            case .sendQuarterlyReport: outcome = Result(text: "Quarterly report failed: \(reason)", failed: true)
            case .sendAnnualReport: outcome = Result(text: "Annual report failed: \(reason)", failed: true)
            }
        }
        results[action] = outcome
        return outcome.text
    }

    func delete() async {
        guard canDelete, !deleting else { return }
        error = nil
        deleting = true
        defer { deleting = false }
        do {
            try await api.adminDeleteUser(id: user.id)
        } catch {
            self.error = Self.message(error, fallback: "Failed to delete user")
            return
        }
        deleted = true
        onDeleted()
    }

    private static func message(_ error: Error, fallback: String) -> String {
        let text = (error as? APIError)?.userMessage ?? ""
        return text.isEmpty ? fallback : text
    }
}

private extension AdminUser {
    func with(isAdmin: Bool? = nil, tier: String? = nil, disabled: Bool? = nil) -> AdminUser {
        AdminUser(id: id, displayName: displayName, email: email, tier: tier ?? self.tier,
                  isAdmin: isAdmin ?? self.isAdmin, disabled: disabled ?? self.disabled, createdAt: createdAt)
    }
}
