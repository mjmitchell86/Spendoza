import SpendozaKit
import SwiftUI

/// Invitations the head sent that haven't been answered, each with Revoke.
struct PendingInvitationsSection: View {
    let model: HouseholdModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            MeSection(title: "Pending invitations") {
                ForEach(model.pending) { invitation in
                    row(invitation)
                }
            }
            if let error = model.pendingError { InlineError(message: error) }
        }
    }

    private func row(_ invitation: PendingInvitation) -> some View {
        RuledRow {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .center, spacing: 8) {
                    details(invitation)
                    Spacer(minLength: 8)
                    revoke(invitation)
                }
                VStack(alignment: .leading, spacing: 6) {
                    details(invitation)
                    revoke(invitation)
                }
            }
            .frame(minHeight: 34)
        }
    }

    private func details(_ invitation: PendingInvitation) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(invitation.email)
                .font(.sans(16, relativeTo: .body))
                .foregroundStyle(Theme.ink)
            Text("Sent \(invitation.createdAt.formatted(date: .abbreviated, time: .omitted)) · Expires \(invitation.expiresAt.formatted(date: .abbreviated, time: .omitted))")
                .font(.sans(13, relativeTo: .footnote))
                .foregroundStyle(Theme.soft)
        }
    }

    private func revoke(_ invitation: PendingInvitation) -> some View {
        Button { Task { await model.revoke(invitation) } } label: {
            Text("Revoke")
                .font(.sans(14, weight: .semibold, relativeTo: .subheadline))
                .foregroundStyle(Theme.oxblood)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .disabled(model.working != nil)
        .opacity(model.working == nil || model.working == .revoking(invitation.id) ? 1 : 0.5)
        .accessibilityLabel("Revoke, \(invitation.email)")
    }
}
