import Foundation

public enum APIError: Error, Equatable, Sendable {
    case unauthorized
    case notOnPlan(requiredTier: String)
    /// The statement exceeds the upload limit; `maxMB` is whole megabytes, rounded down.
    case fileTooLarge(maxMB: Int)
    /// The server's `error` text.
    case message(String)
    case offline
    /// The server refused the account because it was disabled; the text says so and where to write.
    case accountDisabled(String)

    /// Copy for the screen.
    public var userMessage: String {
        switch self {
        case .unauthorized: "Your session has ended. Sign in again."
        case .notOnPlan: "Not available on your plan yet"
        case .fileTooLarge(let maxMB): "This file is too large (max \(maxMB) MB)"
        case .message(let text): text
        case .accountDisabled(let text): text
        case .offline: "You're offline. Check your connection and try again."
        }
    }
}
