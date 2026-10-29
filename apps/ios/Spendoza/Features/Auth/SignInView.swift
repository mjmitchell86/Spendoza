import SpendozaKit
import SwiftUI

struct SignInView: View {
    let store: SessionStore
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false

    private var canSubmit: Bool { !email.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty }

    var body: some View {
        NavigationStack {
            AuthScaffold(title: "Sign in", subtitle: "Welcome back to Spendoza.") {
                if !store.isConfigured {
                    OutlinedPanel { Text(SessionStore.notConfiguredMessage) }
                }
                AuthField(label: "Email", text: $email, contentType: .username, keyboard: .emailAddress)
                AuthField(label: "Password", text: $password, secure: true, contentType: .password)
                if let error { InlineError(message: error) }
                BusyButton(title: "Sign in", busy: busy, action: submit)
                    .disabled(!canSubmit || !store.isConfigured)

                VStack(spacing: 10) {
                    NavigationLink("Create an account with an invite code") { SignUpView(store: store) }
                        .buttonStyle(SecondaryButtonStyle())
                    NavigationLink("Join the waitlist") { WaitlistView(store: store) }
                        .font(.sans(15, weight: .semibold, relativeTo: .callout))
                        .foregroundStyle(Theme.note)
                        .frame(minHeight: 44)
                }
                .padding(.top, 8)
            }
        }
    }

    private func submit() {
        error = nil
        busy = true
        Task {
            defer { busy = false }
            do {
                try await store.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
            } catch let apiError as APIError {
                error = apiError.userMessage
            } catch {
                self.error = "Couldn't sign in. Try again."
            }
        }
    }
}
