import Foundation

/// The Me tab's server calls: photo, invite codes, PDF export, sign-out-others and account deletion.
public protocol AccountAPI: Sendable {
    /// Replaces the profile photo; returns the updated profile.
    func uploadAvatar(jpegData: Data) async throws -> Profile
    func signOutOtherSessions() async throws
    /// Deletes the account for good. A household head with other members gets a message instead.
    func deleteAccount() async throws
    func inviteCodes() async throws -> [InviteCode]
    func createInviteCode() async throws -> InviteCode
    func personalReportPDF(_ period: ReportPeriod) async throws -> PDFFile
    /// Test environment only: asks the server to email the signed-in user a report now.
    func sendTestEmail() async throws
}

/// The admin console's server calls (Task 2 fills this in).
public protocol AdminAPI: Sendable {}
