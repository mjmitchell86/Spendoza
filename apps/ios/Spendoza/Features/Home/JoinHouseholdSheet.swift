import SpendozaKit
import SwiftUI

/// Join a household with its invite code. Stays open with the server's words when it fails; closes when it worked.
struct JoinHouseholdSheet: View {
    let model: HomeModel
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var error: String?
    @State private var notOnPlan = false
    @State private var busy = false

    private var canSubmit: Bool { !HouseholdCode.normalize(code).isEmpty && !busy }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Join a household")
                    .font(.serif(22, relativeTo: .title2))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                if notOnPlan {
                    PlanNotAvailableView()
                    Button("Close") { dismiss() }.buttonStyle(SecondaryButtonStyle())
                } else {
                    Text("Enter the invite code from your household head to join an existing household.")
                        .font(.sans(15, relativeTo: .subheadline))
                        .foregroundStyle(Theme.soft)
                    // Codes are matched after the server normalizes them, but never autocorrect or capitalize.
                    AuthField(label: "Invite code", text: $code, capitalization: .never,
                              placeholder: "Enter invite code")
                    if let error { InlineError(message: error) }
                    BusyButton(title: "Join household", busy: busy, action: submit)
                        .disabled(!canSubmit)
                        .opacity(canSubmit || busy ? 1 : 0.45)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.paper.ignoresSafeArea())
        .presentationDetents([.medium, .large])
    }

    private func submit() {
        error = nil
        busy = true
        Task {
            defer { busy = false }
            do {
                try await model.join(code: code)
                dismiss()
            } catch APIError.notOnPlan {
                notOnPlan = true
            } catch let apiError as APIError {
                error = apiError.userMessage
            } catch {
                self.error = "Failed to join household"
            }
        }
    }
}
