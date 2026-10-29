import Foundation

/// Says whose data the per-account caches hold, and which "sign-in era" a write belongs to.
/// A write captures a `Token` before it starts; if the account changed or signed out meanwhile
/// (the generation moved on), the write is dropped instead of landing in the next account's cache.
public final class AccountScope: @unchecked Sendable {
    public struct Token: Equatable, Sendable {
        let generation: Int
    }

    private let lock = NSLock()
    private var _userID: String?
    private var _generation = 0

    public init(userID: String? = nil) {
        _userID = userID
    }

    public var userID: String? { lock.withLock { _userID } }

    public func token() -> Token { lock.withLock { Token(generation: _generation) } }

    public func isCurrent(_ token: Token) -> Bool { lock.withLock { token.generation == _generation } }

    /// A (different) user signed in or was restored. Writes started for anyone else are now stale.
    public func begin(userID: String) {
        lock.withLock {
            if _userID != userID {
                _userID = userID
                _generation += 1
            }
        }
    }

    /// Signed out. Call before clearing caches so in-flight writes can't land afterwards.
    public func end() {
        lock.withLock {
            _userID = nil
            _generation += 1
        }
    }

    /// Runs `body` with the user id only if `token` is still current, holding the scope's lock so `end()`
    /// can't slip in between the check and the write.
    func performIfCurrent(_ token: Token, _ body: (String) -> Void) {
        lock.withLock {
            guard token.generation == _generation, let id = _userID, Self.isSafe(id) else { return }
            body(id)
        }
    }

    /// The current user id, if it is safe to use as a folder name.
    var safeUserID: String? { lock.withLock { _userID.flatMap { Self.isSafe($0) ? $0 : nil } } }

    private static func isSafe(_ id: String) -> Bool {
        !id.isEmpty && id.count <= 64 && id.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") }
    }
}

/// Files under `<root>/<user id>/`, written with complete file protection.
final class ScopedFiles: @unchecked Sendable {
    private let root: URL
    private let scope: AccountScope
    private let lock = NSLock()

    init(root: URL, scope: AccountScope) {
        self.root = root
        self.scope = scope
    }

    func write(_ data: Data, name: String, token: AccountScope.Token) {
        scope.performIfCurrent(token) { userID in
            lock.withLock {
                let dir = root.appendingPathComponent(userID, isDirectory: true)
                #if os(iOS)
                // Unreadable while the phone is locked. (macOS, used by `swift test`, has no data protection classes.)
                let attributes: [FileAttributeKey: Any] = [.protectionKey: FileProtectionType.complete]
                let options: Data.WritingOptions = [.atomic, .completeFileProtection]
                #else
                let attributes: [FileAttributeKey: Any] = [:]
                let options: Data.WritingOptions = [.atomic]
                #endif
                try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: attributes)
                try? data.write(to: dir.appendingPathComponent(name), options: options)
            }
        }
    }

    func read(name: String) -> Data? {
        guard let userID = scope.safeUserID else { return nil }
        return lock.withLock {
            try? Data(contentsOf: root.appendingPathComponent(userID, isDirectory: true).appendingPathComponent(name))
        }
    }

    func removeAll() {
        lock.withLock { try? FileManager.default.removeItem(at: root) }
    }
}
