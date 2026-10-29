import Foundation

/// Serves canned responses to a `URLSession` built with `StubURLProtocol.session()`.
/// The handler lives in a lock-protected store, so Swift 6 strict concurrency is satisfied;
/// suites that use it are `.serialized` because the store is process-wide.
final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    typealias Handler = @Sendable (URLRequest) throws -> (HTTPURLResponse, Data)

    private static let store = HandlerStore()

    static func setHandler(_ handler: Handler?) { store.set(handler) }

    static func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: config)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.store.get() else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

private final class HandlerStore: @unchecked Sendable {
    private let lock = NSLock()
    private var handler: StubURLProtocol.Handler?

    func set(_ new: StubURLProtocol.Handler?) { lock.lock(); handler = new; lock.unlock() }
    func get() -> StubURLProtocol.Handler? { lock.lock(); defer { lock.unlock() }; return handler }
}

/// Collects the requests a handler saw.
final class RequestLog: @unchecked Sendable {
    private let lock = NSLock()
    private var items: [CapturedRequest] = []

    func add(_ request: URLRequest) {
        let captured = CapturedRequest(request)
        lock.lock(); items.append(captured); lock.unlock()
    }
    var all: [CapturedRequest] { lock.lock(); defer { lock.unlock() }; return items }
    var count: Int { all.count }
}

struct CapturedRequest: Sendable {
    let url: URL
    let method: String
    let headers: [String: String]
    let body: Data

    init(_ request: URLRequest) {
        url = request.url!
        method = request.httpMethod ?? "GET"
        headers = request.allHTTPHeaderFields ?? [:]
        body = Self.readBody(request)
    }

    var path: String { url.path }
    var query: [String: String] {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        return Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
    }
    var json: [String: Any]? { try? JSONSerialization.jsonObject(with: body) as? [String: Any] }

    private static func readBody(_ request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 16_384)
        while stream.hasBytesAvailable {
            let n = stream.read(&buffer, maxLength: buffer.count)
            if n <= 0 { break }
            data.append(buffer, count: n)
        }
        return data
    }
}

func httpResponse(_ request: URLRequest, status: Int) -> HTTPURLResponse {
    HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"])!
}
