import Auth
import Foundation
import Testing
@testable import SpendozaKit

@Suite struct SignInErrorTests {
    private func authError(_ code: ErrorCode) -> AuthError {
        .api(message: "x", errorCode: code, underlyingData: Data(),
             underlyingResponse: HTTPURLResponse(url: URL(string: "https://x.test")!, statusCode: 400, httpVersion: nil, headerFields: nil)!)
    }

    @Test func invalidCredentialsSaysTheyDontMatch() {
        #expect(signInError(authError(.invalidCredentials))
            == .message("That email and password don't match. Check them and try again."))
    }

    @Test func offlineUsesTheOfflineCopy() {
        #expect(signInError(URLError(.notConnectedToInternet)) == .offline)
        #expect(signInError(URLError(.networkConnectionLost)) == .offline)
    }

    @Test func everythingElseIsAGenericRetry() {
        #expect(signInError(authError(.unexpectedFailure)) == .message("Couldn't sign in. Try again."))
        #expect(signInError(URLError(.badServerResponse)) == .message("Couldn't sign in. Try again."))
        #expect(signInError(CancellationError()) == .message("Couldn't sign in. Try again."))
    }
}

@Suite struct SignUpFlowTests {
    struct Boom: Error {}

    @Test func accountCreatedButSignInFailsReportsAccountReady() async {
        do {
            try await completeSignUp(email: "a@b.co", createAccount: {}, signIn: { throw Boom() })
            Issue.record("expected an error")
        } catch let error as AccountReadyError {
            #expect(error.email == "a@b.co")
            #expect(error.message == "Your account is ready. Sign in to continue.")
        } catch {
            Issue.record("wrong error \(error)")
        }
    }

    @Test func createFailureIsPassedThroughAndSkipsSignIn() async {
        let signedIn = Flag()
        do {
            try await completeSignUp(email: "a@b.co", createAccount: { throw APIError.message("Invalid invite code") },
                                     signIn: { signedIn.set() })
            Issue.record("expected an error")
        } catch {
            #expect(error as? APIError == .message("Invalid invite code"))
        }
        #expect(!signedIn.value)
    }
}

private final class Flag: @unchecked Sendable {
    private let lock = NSLock()
    private var flag = false
    func set() { lock.lock(); flag = true; lock.unlock() }
    var value: Bool { lock.lock(); defer { lock.unlock() }; return flag }
}
