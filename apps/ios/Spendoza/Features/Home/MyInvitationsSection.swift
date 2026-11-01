import SpendozaKit
import SwiftUI

/// The invitations addressed to you: the screen's one filled note-green panel. Each needs the code from its email.
struct MyInvitationsSection: View {
    let model: HomeModel
    let invitations: [MyInvitation]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("My invitations")
                .font(.serif(20, relativeTo: .title3))
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 8)
            ForEach(invitations) { invitation in
                InvitationRow(model: model, invitation: invitation)
                    .overlay(alignment: .top) { Theme.onNote.opacity(0.35).frame(height: 1) }
            }
        }
        .foregroundStyle(Theme.onNote)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Theme.note, in: RoundedRectangle(cornerRadius: Theme.corner))
    }
}

private struct InvitationRow: View {
    let model: HomeModel
    let invitation: MyInvitation
    @State private var code = ""

    private var busy: Bool { model.busyInvitationID == invitation.id }
    private var canAct: Bool { !HouseholdCode.normalize(code).isEmpty && model.busyInvitationID == nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(invitation.inviterName) invited you to \(invitation.householdName)")
                .font(.sans(16, weight: .semibold, relativeTo: .body))
            // Codes are matched after the server normalizes them, but never autocorrect or capitalize.
            TextField("", text: $code, prompt: Text("ABCDE-FGHJK").foregroundStyle(Theme.soft))
                .font(.sans(16, relativeTo: .body))
                .foregroundStyle(Theme.ink)
                .tint(Theme.note)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.horizontal, 12)
                .frame(minHeight: 44)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
                .accessibilityLabel("Invitation code")
            Text("Enter the code from your invitation email.")
                .font(.sans(13, relativeTo: .footnote))
            if model.planRefused.contains(invitation.id) {
                // On the card colour, like the error below: the plan notice's ink would not read on the green.
                PlanNotAvailableView()
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
            }
            if let error = model.invitationErrors[invitation.id] {
                // Oxblood on the green panel would not read; the card-coloured note keeps contrast.
                Text(error)
                    .font(.sans(14, weight: .semibold, relativeTo: .footnote))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .foregroundStyle(Theme.oxblood)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
                    .accessibilityLabel("Error: \(error)")
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { accept; decline }
                VStack(spacing: 10) { accept; decline }
            }
        }
        .padding(.vertical, 12)
    }

    private var accept: some View {
        Button { Task { await model.accept(invitation, code: code) } } label: {
            Group { if busy { ProgressView().tint(Theme.note) } else { Text("Accept") } }
                .font(.sans(15, weight: .semibold, relativeTo: .callout))
                .foregroundStyle(Theme.note)
                .frame(maxWidth: .infinity, minHeight: 44)
                // Dim the fill, not the label: a faded label on the green would not keep its contrast.
                .background(Theme.card.opacity(canAct || busy ? 1 : 0.5), in: RoundedRectangle(cornerRadius: Theme.corner))
        }
        .disabled(!canAct)
        .accessibilityLabel(busy ? "Accept, working" : "Accept")
    }

    private var decline: some View {
        Button { Task { await model.decline(invitation, code: code) } } label: {
            Text("Decline")
                .font(.sans(15, weight: .semibold, relativeTo: .callout))
                .foregroundStyle(Theme.onNote)
                .frame(maxWidth: .infinity, minHeight: 44)
                .overlay(RoundedRectangle(cornerRadius: Theme.corner)
                    .strokeBorder(Theme.onNote.opacity(canAct ? 1 : 0.5), lineWidth: 1))
        }
        .disabled(!canAct)
    }
}
