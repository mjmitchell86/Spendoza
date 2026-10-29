import SpendozaKit
import SwiftUI

struct WaitlistView: View {
    let store: SessionStore
    @State private var name = ""
    @State private var email = ""
    @State private var error: String?
    @State private var busy = false
    @State private var joined = false

    private var canSubmit: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !email.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        AuthScaffold(title: "Join the waitlist", subtitle: "Tell us where to send your invite.") {
            if joined {
                SuggestionPanel {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("You're on the list")
                            .font(.serif(20, relativeTo: .title3))
                        Text("We'll email you when your invite is ready.")
                    }
                }
                .accessibilityElement(children: .combine)
            } else {
                AuthField(label: "Name", text: $name, contentType: .name, capitalization: .words)
                AuthField(label: "Email", text: $email, contentType: .emailAddress, keyboard: .emailAddress)
                if let error { InlineError(message: error) }
                BusyButton(title: "Join the waitlist", busy: busy, action: submit)
                    .disabled(!canSubmit)
            }
        }
    }

    private func submit() {
        error = nil
        busy = true
        Task {
            defer { busy = false }
            do {
                try await store.api.joinWaitlist(
                    name: name.trimmingCharacters(in: .whitespaces),
                    email: email.trimmingCharacters(in: .whitespaces)
                )
                joined = true
            } catch let apiError as APIError {
                error = apiError.userMessage
            } catch {
                self.error = "Couldn't join the waitlist. Try again."
            }
        }
    }
}
