import SpendozaKit
import SwiftUI

/// The head invites someone by email; the invitation shows under Pending invitations.
/// (An inline form rather than a sheet: it is one field and one button.)
struct InviteByEmailSheet: View {
    let model: HouseholdModel
    @State private var email = ""

    private var canSend: Bool {
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && model.working == nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            AuthField(label: "Invite by email", text: $email, contentType: .emailAddress,
                      keyboard: .emailAddress, placeholder: "email@example.com")
                // Clearing the field after a send must not also clear the "Invitation sent" line.
                .onChange(of: email) { if !email.isEmpty { model.clearInviteResult() } }
            switch model.inviteResult {
            case .sent:
                Text("Invitation sent")
                    .font(.sans(14, weight: .semibold, relativeTo: .subheadline))
                    .foregroundStyle(Theme.note)
            case .plan:
                PlanNotAvailableView()
            case .failed(let message):
                InlineError(message: message)
            case nil:
                EmptyView()
            }
            Button { Task { if await model.sendInvitation(email: email) { email = "" } } } label: {
                if model.working == .inviting {
                    ProgressView().tint(Theme.onNote)
                } else {
                    Text("Send invitation")
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!canSend)
            .opacity(canSend || model.working == .inviting ? 1 : 0.45)
            .accessibilityLabel(model.working == .inviting ? "Sending invitation" : "Send invitation")
        }
    }
}
