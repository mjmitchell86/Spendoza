import SpendozaKit
import SwiftUI

struct SignUpView: View {
    let store: SessionStore
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var inviteCode = ""
    @State private var error: String?
    @State private var busy = false

    private var canSubmit: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
            && !email.trimmingCharacters(in: .whitespaces).isEmpty
            && password.count >= 8
            && !inviteCode.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        AuthScaffold(title: "Sign up", subtitle: "Spendoza is invite-only for now. Enter your invite code to start.") {
            if !store.isConfigured {
                OutlinedPanel { Text(SessionStore.notConfiguredMessage) }
            }
            AuthField(label: "Name", text: $name, contentType: .name, capitalization: .words)
            AuthField(label: "Email", text: $email, contentType: .username, keyboard: .emailAddress)
            VStack(alignment: .leading, spacing: 6) {
                AuthField(label: "Password", text: $password, secure: true, contentType: .newPassword)
                Text("Use at least 8 characters.")
                    .font(.sans(13, relativeTo: .footnote))
                    .foregroundStyle(Theme.soft)
            }
            AuthField(label: "Invite code", text: $inviteCode, capitalization: .characters)
            if let error { InlineError(message: error) }
            BusyButton(title: "Create account", busy: busy, action: submit)
                .disabled(!canSubmit || !store.isConfigured)
            NavigationLink("No invite code? Join the waitlist") { WaitlistView(store: store) }
                .font(.sans(15, weight: .semibold, relativeTo: .callout))
                .foregroundStyle(Theme.note)
                .frame(minHeight: 44)
        }
    }

    private func submit() {
        error = nil
        busy = true
        Task {
            defer { busy = false }
            do {
                try await store.signUp(
                    displayName: name.trimmingCharacters(in: .whitespaces),
                    email: email.trimmingCharacters(in: .whitespaces),
                    password: password,
                    inviteCode: inviteCode.trimmingCharacters(in: .whitespaces)
                )
            } catch let apiError as APIError {
                error = apiError.userMessage
            } catch {
                self.error = "Couldn't create your account. Try again."
            }
        }
    }
}
