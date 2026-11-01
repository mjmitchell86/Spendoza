import SpendozaKit
import SwiftUI

/// The head's invite code: large and monospaced, with Copy, Share and Get a new code.
struct InviteCodeCard: View {
    let model: HouseholdModel
    @State private var confirming = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Invite code")
                .font(.serif(20, relativeTo: .title3))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            OutlinedPanel {
                VStack(alignment: .leading, spacing: 8) {
                    if let code = model.codeText {
                        Text(code)
                            .font(.system(.title, design: .monospaced, weight: .medium))
                            .foregroundStyle(Theme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                            .textSelection(.enabled)
                            .accessibilityIdentifier("householdInviteCode")
                        HStack(spacing: 12) {
                            CopyButton(text: code, label: "Copy code")
                            ShareLink(item: HouseholdModel.shareText(code: code)) { Text("Share") }
                                .font(.sans(14, relativeTo: .subheadline))
                                .foregroundStyle(Theme.note)
                                .frame(minWidth: 44, minHeight: 44)
                                .contentShape(Rectangle())
                                .accessibilityLabel("Share code")
                        }
                    }
                    Text(model.codeText == nil
                         ? "Your household has no code yet. Get a new code to share one."
                         : "Share this code with people you want to join your household.")
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.soft)
                        .fixedSize(horizontal: false, vertical: true)
                    Button { confirming = true } label: {
                        Text(model.working == .rotating ? "Working…" : "Get a new code")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(model.working != nil)
                    .opacity(model.working == nil || model.working == .rotating ? 1 : 0.5)
                }
            }
            if let error = model.codeError { AreaErrorView(error: error) }
        }
        .alert(HouseholdModel.rotateTitle, isPresented: $confirming) {
            Button("Cancel", role: .cancel) {}
            Button("Get a new code") { Task { await model.rotateCode() } }
        } message: {
            Text(HouseholdModel.rotateBody)
        }
    }
}
