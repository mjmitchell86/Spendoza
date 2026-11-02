import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

// Serialized: the launch sweep tests delete the shared temp folder.
@MainActor @Suite(.serialized)
struct OpenedFileTests {
    private func source(_ name: String, bytes: Int) throws -> URL {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("opened-file-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let url = folder.appendingPathComponent(name)
        try Data(repeating: 0x25, count: bytes).write(to: url)
        return url
    }

    private func accepted(_ result: Result<URL, APIError>) throws -> URL {
        try #require(try? result.get())
    }

    @Test func aSmallPDFIsCopiedIntoTheTempFolderUnderItsName() throws {
        let original = try source("October.pdf", bytes: 2_000)
        let copy = try accepted(OpenedFile.accept(original))
        defer { OpenedFile.discard(copy) }
        #expect(copy.lastPathComponent == "October.pdf")
        #expect(copy != original)
        #expect(OpenedFile.isCopy(copy))
        #expect(!OpenedFile.isCopy(original))
        #expect(FileManager.default.contents(atPath: copy.path)?.count == 2_000)
        // The original is left alone.
        #expect(FileManager.default.fileExists(atPath: original.path))
    }

    @Test func aCSVIsAccepted() throws {
        let copy = try accepted(OpenedFile.accept(try source("Chase.CSV", bytes: 50)))
        defer { OpenedFile.discard(copy) }
        #expect(StatementFile.mimeType(for: copy) == "text/csv")
    }

    @Test func aFiveMegabyteFileIsRefusedBeforeAnythingIsCopied() throws {
        let big = try source("big.pdf", bytes: 5 * 1_048_576)
        let result = OpenedFile.accept(big)
        #expect(result == .failure(.fileTooLarge(maxMB: APIClient.maxStatementMB)))
        guard case .failure(let error) = result else { return }
        #expect(error.userMessage == "This file is too large (max 4 MB)")
        #expect(!FileManager.default.fileExists(atPath: OpenedFile.folder.appendingPathComponent("big.pdf").path))
    }

    @Test func aTextFileIsRefused() throws {
        let result = OpenedFile.accept(try source("notes.txt", bytes: 10))
        guard case .failure(let error) = result else { Issue.record("accepted a .txt"); return }
        #expect(error.userMessage == "Choose a PDF or CSV file.")
    }

    @Test func aFileThatCantBeReadIsRefused() {
        let gone = FileManager.default.temporaryDirectory.appendingPathComponent("missing-\(UUID().uuidString).pdf")
        guard case .failure(let error) = OpenedFile.accept(gone) else { Issue.record("accepted a missing file"); return }
        #expect(error.userMessage == "Couldn't open this file. Try again.")
    }

    @Test func twoFilesWithTheSameNameDontOverwriteEachOther() throws {
        let a = try accepted(OpenedFile.accept(try source("same.pdf", bytes: 10)))
        let b = try accepted(OpenedFile.accept(try source("same.pdf", bytes: 20)))
        defer { OpenedFile.discard(a); OpenedFile.discard(b) }
        #expect(a != b)
        #expect(FileManager.default.contents(atPath: a.path)?.count == 10)
        #expect(FileManager.default.contents(atPath: b.path)?.count == 20)
    }

    @Test func discardingRemovesTheCopyAndLeavesOtherFilesAlone() throws {
        let original = try source("keep.pdf", bytes: 10)
        let copy = try accepted(OpenedFile.accept(original))
        OpenedFile.discard(copy)
        #expect(!FileManager.default.fileExists(atPath: copy.path))
        OpenedFile.discard(original)
        #expect(FileManager.default.fileExists(atPath: original.path))
    }

    // MARK: The system's Inbox copy

    private var home: URL { URL(fileURLWithPath: NSHomeDirectory()) }

    private func inboxFile(_ name: String, in inbox: URL) throws -> URL {
        try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        let url = inbox.appendingPathComponent(name)
        try Data(repeating: 0x25, count: 100).write(to: url)
        return url
    }

    @Test func theInboxCopyIsDeletedOnceAccepted() throws {
        let inbox = try inboxFile("inbox-\(UUID().uuidString).pdf", in: home.appendingPathComponent("Documents/Inbox"))
        let copy = try accepted(OpenedFile.accept(inbox))
        defer { OpenedFile.discard(copy) }
        #expect(!FileManager.default.fileExists(atPath: inbox.path))
        #expect(FileManager.default.fileExists(atPath: copy.path))
    }

    @Test func aTmpInboxCopyIsDeletedToo() throws {
        let tmpInbox = home.appendingPathComponent("tmp/com.gravitaz.spendoza-Inbox")
        let inbox = try inboxFile("inbox-\(UUID().uuidString).csv", in: tmpInbox)
        let copy = try accepted(OpenedFile.accept(inbox))
        defer { OpenedFile.discard(copy) }
        #expect(!FileManager.default.fileExists(atPath: inbox.path))
    }

    @Test func theInboxCopyIsDeletedWhenTheFileIsRefusedToo() throws {
        let inbox = home.appendingPathComponent("Documents/Inbox")
        try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        let big = inbox.appendingPathComponent("big-\(UUID().uuidString).pdf")
        try Data(repeating: 0x25, count: 5 * 1_048_576).write(to: big)
        _ = OpenedFile.accept(big)
        #expect(!FileManager.default.fileExists(atPath: big.path))
    }

    @Test func aPathThatOnlyLooksLikeTheInboxIsLeftAlone() throws {
        // ".." out of the Inbox lands on a file that is not in it.
        let outside = try source("dots.pdf", bytes: 10)
        let inbox = home.appendingPathComponent("Documents/Inbox")
        try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        let sneaky = URL(fileURLWithPath: inbox.path + "/../../" + outside.path.replacingOccurrences(of: home.path + "/", with: ""))
        let copy = try accepted(OpenedFile.accept(sneaky))
        defer { OpenedFile.discard(copy) }
        #expect(FileManager.default.fileExists(atPath: outside.path))
    }

    @Test func aFileOutsideTheAppContainerIsNeverDeleted() throws {
        let folder = URL(fileURLWithPath: "/tmp/spendoza-outside-\(UUID().uuidString)/Inbox")
        let file = try inboxFile("outside.pdf", in: folder)
        defer { try? FileManager.default.removeItem(at: folder.deletingLastPathComponent()) }
        let copy = try accepted(OpenedFile.accept(file))
        defer { OpenedFile.discard(copy) }
        #expect(FileManager.default.fileExists(atPath: file.path))
    }

    @Test func launchSweepEmptiesTheInboxesAndTheCopies() throws {
        let documentsInbox = try inboxFile("left.pdf", in: home.appendingPathComponent("Documents/Inbox"))
        let tmpInbox = try inboxFile("left.csv", in: home.appendingPathComponent("tmp/com.gravitaz.spendoza-Inbox"))
        let copy = try accepted(OpenedFile.accept(try source("a.pdf", bytes: 10)))
        OpenedFile.removeLeftovers()
        #expect(!FileManager.default.fileExists(atPath: documentsInbox.path))
        #expect(!FileManager.default.fileExists(atPath: tmpInbox.path))
        #expect(!FileManager.default.fileExists(atPath: copy.path))
    }

    @Test func theCopyIsExcludedFromBackup() throws {
        let copy = try accepted(OpenedFile.accept(try source("p.pdf", bytes: 10)))
        defer { OpenedFile.discard(copy) }
        #expect(try copy.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
        // (The simulator doesn't report a file's protection class, so `.complete` is only set, not read back.)
    }

    // MARK: Waiting for the sheet

    @Test func openedFilesWaitUntilTheSheetTakesThem() throws {
        let incoming = IncomingStatements()
        incoming.open(try source("a.pdf", bytes: 10))
        incoming.open(try source("b.csv", bytes: 10))
        #expect(incoming.pending.map(\.lastPathComponent) == ["a.pdf", "b.csv"])
        let taken = incoming.take()
        defer { taken.forEach(OpenedFile.discard) }
        #expect(taken.count == 2)
        #expect(incoming.pending.isEmpty)
    }

    @Test func aRefusedFileSetsTheErrorAndWaitsForNothing() throws {
        let incoming = IncomingStatements()
        incoming.open(try source("big.pdf", bytes: 5 * 1_048_576))
        #expect(incoming.pending.isEmpty)
        #expect(incoming.error == "This file is too large (max 4 MB)")
    }

    @Test func onlyFileLinksAreTakenAsStatements() throws {
        let incoming = IncomingStatements()
        #expect(!incoming.handle(URL(string: "spendoza://auth/callback?code=1")!))
        #expect(!incoming.handle(URL(string: "https://spendoza.io/x.pdf")!))
        #expect(incoming.pending.isEmpty)
        #expect(incoming.error == nil)
        #expect(incoming.handle(try source("a.pdf", bytes: 1)))
        incoming.discardAll()
    }

    @Test func clearingDeletesEveryWaitingCopy() throws {
        let incoming = IncomingStatements()
        incoming.open(try source("a.pdf", bytes: 10))
        let copy = try #require(incoming.pending.first)
        incoming.discardAll()
        #expect(incoming.pending.isEmpty)
        #expect(!FileManager.default.fileExists(atPath: copy.path))
    }
}
