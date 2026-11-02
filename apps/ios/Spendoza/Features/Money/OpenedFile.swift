import Foundation
import Observation
import SpendozaKit

/// A statement opened in Spendoza from the share sheet or Files. The file is copied into the app's temporary
/// folder, so it is ours to read whenever the upload runs and ours to delete afterwards.
enum OpenedFile {
    /// Where the copies live, one folder each so two files with the same name don't meet.
    static let folder = FileManager.default.temporaryDirectory.appendingPathComponent("opened-statements", isDirectory: true)

    private static let unreadable = APIError.message("Couldn't open this file. Try again.")

    /// Checks the type (PDF or CSV) and size (what the API accepts) of `url`, then returns a copy of it. iOS hands
    /// a file opened from another app over as a copy in this app's own Inbox; that one is deleted here whatever
    /// the outcome, so statements don't pile up in the app's folders and backups.
    static func accept(_ url: URL) -> Result<URL, APIError> {
        let scoped = url.startAccessingSecurityScopedResource()
        defer {
            if scoped { url.stopAccessingSecurityScopedResource() }
            if isInboxFile(url) { try? FileManager.default.removeItem(at: url) }
        }
        return copy(url)
    }

    private static func copy(_ url: URL) -> Result<URL, APIError> {
        guard StatementFile.mimeType(for: url) != nil else { return .failure(.message(StatementFile.wrongTypeMessage)) }
        guard let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize else { return .failure(unreadable) }
        if size > APIClient.maxStatementBytes { return .failure(.fileTooLarge(maxMB: APIClient.maxStatementMB)) }
        let copy = folder.appendingPathComponent(UUID().uuidString, isDirectory: true).appendingPathComponent(url.lastPathComponent)
        do {
            try FileManager.default.createDirectory(at: copy.deletingLastPathComponent(), withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: url, to: copy)
            // The size is checked again on the copy: the source may have grown since it was measured.
            let copied = try copy.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard copied <= APIClient.maxStatementBytes else {
                discard(copy)
                return .failure(.fileTooLarge(maxMB: APIClient.maxStatementMB))
            }
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: copy.path)
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var excluded = copy
            try excluded.setResourceValues(values)
        } catch {
            discard(copy)
            return .failure(unreadable)
        }
        return .success(copy)
    }

    // MARK: The system's Inbox

    private static var container: URL { URL(fileURLWithPath: NSHomeDirectory()).resolvingSymlinksInPath() }
    private static var documentsInbox: URL { container.appendingPathComponent("Documents/Inbox", isDirectory: true) }
    private static var tmp: URL { container.appendingPathComponent("tmp", isDirectory: true) }

    /// Inside the app's own Inbox ("Documents/Inbox", or a "<bundle id>-Inbox" folder in tmp). Paths are resolved
    /// (".." and symlinks) first, so only a file that really is in an Inbox of this app's container counts; a file
    /// opened in place from Files, or anywhere else, never does.
    static func isInboxFile(_ url: URL) -> Bool {
        let path = url.resolvingSymlinksInPath().path
        if path.hasPrefix(documentsInbox.path + "/") { return true }
        let tmpPrefix = tmp.path + "/"
        guard path.hasPrefix(tmpPrefix) else { return false }
        let first = path.dropFirst(tmpPrefix.count).split(separator: "/", omittingEmptySubsequences: true)
        return first.count > 1 && first[0].hasSuffix("-Inbox")
    }

    /// True for a copy `accept` made (these are not security scoped, and are deleted when done with).
    static func isCopy(_ url: URL) -> Bool {
        url.resolvingSymlinksInPath().path.hasPrefix(folder.resolvingSymlinksInPath().path + "/")
    }

    /// Deletes a copy made by `accept`; any other file is left alone.
    static func discard(_ url: URL) {
        guard isCopy(url) else { return }
        try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
    }

    /// How long a file in the Inbox is left for `accept`. A share to a closed app puts the file in the Inbox before
    /// the app launches, and `.onOpenURL` only hands it over after launch, so a new one is never swept.
    static let inboxGracePeriod: TimeInterval = 10 * 60

    private static let inboxDates: [URLResourceKey] = [.addedToDirectoryDateKey, .creationDateKey, .contentModificationDateKey]

    /// Copies (and Inbox files older than the grace period) left behind by a run that was closed before they were
    /// uploaded.
    static func removeLeftovers(now: Date = Date()) {
        let files = FileManager.default
        try? files.removeItem(at: folder)
        let inboxes = [documentsInbox] + ((try? files.contentsOfDirectory(at: tmp, includingPropertiesForKeys: nil)) ?? [])
            .filter { $0.lastPathComponent.hasSuffix("-Inbox") }
        for inbox in inboxes {
            for file in (try? files.contentsOfDirectory(at: inbox, includingPropertiesForKeys: inboxDates)) ?? [] {
                // The newest of its dates: a copy can keep its source's modification date.
                let values = try? file.resourceValues(forKeys: Set(inboxDates))
                let arrived = [values?.addedToDirectoryDate, values?.creationDate, values?.contentModificationDate]
                    .compactMap { $0 }.max() ?? .distantPast
                if now.timeIntervalSince(arrived) > inboxGracePeriod { try? files.removeItem(at: file) }
            }
        }
    }
}

/// Statements opened from outside the app, waiting for Money's upload sheet to take them. They wait while the
/// app is signed out or locked.
@MainActor @Observable
final class IncomingStatements {
    private(set) var pending: [URL] = []
    /// Why the last file was refused, for an alert.
    var error: String?

    /// `.onOpenURL`: files are statements; anything else (auth callbacks, deep links) is not ours.
    @discardableResult
    func handle(_ url: URL) -> Bool {
        guard url.isFileURL else { return false }
        open(url)
        return true
    }

    func open(_ url: URL) {
        switch OpenedFile.accept(url) {
        case .success(let copy): pending.append(copy)
        case .failure(let failure): error = failure.userMessage
        }
    }

    /// Hands the waiting files over (the receiver deletes them when done).
    func take() -> [URL] {
        defer { pending = [] }
        return pending
    }

    func discardAll() {
        pending.forEach(OpenedFile.discard)
        pending = []
    }
}
