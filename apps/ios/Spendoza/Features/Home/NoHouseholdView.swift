import SpendozaKit
import SwiftUI

/// Home without a household: your invitations (when there are any), then Create and Join.
struct NoHouseholdView: View {
    let model: HomeModel
    let invitations: [MyInvitation]
    @State private var creating = false
    @State private var joining = false

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("Create or join a household to share finances with your family")
                .font(.sans(16, relativeTo: .body))
                .foregroundStyle(Theme.soft)
            if !invitations.isEmpty {
                MyInvitationsSection(model: model, invitations: invitations)
            }
            VStack(spacing: 0) {
                Button { creating = true } label: {
                    row("Create a household", "Start a new household and invite your family members to join.")
                }
                Button { joining = true } label: {
                    row("Join a household", "Enter the invite code from your household head to join an existing household.")
                }
            }
            .buttonStyle(.plain)
            .topRule()
        }
        .sheet(isPresented: $creating) { CreateHouseholdSheet(model: model) }
        .sheet(isPresented: $joining) { JoinHouseholdSheet(model: model) }
    }

    private func row(_ title: String, _ detail: String) -> some View {
        RuledRow {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.serif(18, relativeTo: .headline))
                        .foregroundStyle(Theme.ink)
                    Text(detail)
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.soft)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 8)
                Text("›")
                    .font(.sans(14, relativeTo: .subheadline))
                    .foregroundStyle(Theme.soft)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
    }
}
