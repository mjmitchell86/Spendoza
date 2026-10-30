import Foundation
import Observation
import SpendozaKit

/// The signed-in person's profile on the Me tab: name edits and the photo. Every successful change is handed to
/// `apply` (the session store's) so the rest of the app sees it.
@Observable @MainActor
final class MeModel {
    static let nameLimit = 100

    private(set) var profile: Profile?
    /// The last failure, in words for the screen; cleared when the next change starts.
    var error: String?
    private(set) var isUploading = false

    @ObservationIgnored private let api: any SpendozaAPI
    @ObservationIgnored private let apply: @MainActor (Profile) -> Void

    init(api: any SpendozaAPI, profile: Profile?, apply: @escaping @MainActor (Profile) -> Void) {
        self.api = api
        self.profile = profile
        self.apply = apply
    }

    /// Saves a trimmed display name. An empty name does nothing; one over 100 characters is refused.
    func saveName(_ name: String) async -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        guard trimmed.count <= Self.nameLimit else {
            error = "Use \(Self.nameLimit) characters or fewer"
            return false
        }
        return await update(ProfileChange(displayName: trimmed))
    }

    /// Sends a profile change; true when the server accepted it.
    func update(_ change: ProfileChange) async -> Bool {
        error = nil
        do {
            let updated = try await api.updateProfile(change)
            profile = updated
            apply(updated)
            return true
        } catch {
            self.error = Self.message(for: error)
            return false
        }
    }

    /// Uploads an already-downscaled JPEG as the profile photo.
    func uploadPhoto(_ imageData: Data) async {
        error = nil
        isUploading = true
        defer { isUploading = false }
        do {
            let updated = try await api.uploadAvatar(jpegData: imageData)
            profile = updated
            apply(updated)
        } catch {
            self.error = Self.message(for: error)
        }
    }

    private static func message(for error: Error) -> String {
        (error as? APIError)?.userMessage ?? APIError.offline.userMessage
    }
}
