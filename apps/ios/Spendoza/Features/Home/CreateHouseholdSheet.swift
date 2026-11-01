import SpendozaKit
import SwiftUI

/// Name a new household. Stays open with the server's words when it fails; closes when it worked.
struct CreateHouseholdSheet: View {
    let model: HomeModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var error: String?
    @State private var notOnPlan = false
    @State private var busy = false

    private var canSubmit: Bool { !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !busy }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Create a household")
                    .font(.serif(22, relativeTo: .title2))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                if notOnPlan {
                    PlanNotAvailableView()
                    Button("Close") { dismiss() }.buttonStyle(SecondaryButtonStyle())
                } else {
                    Text("Start a new household and invite your family members to join.")
                        .font(.sans(15, relativeTo: .subheadline))
                        .foregroundStyle(Theme.soft)
                    AuthField(label: "Household name", text: $name, capitalization: .words,
                              placeholder: "e.g. The Smiths")
                    if let error { InlineError(message: error) }
                    BusyButton(title: "Create household", busy: busy, action: submit)
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
                try await model.create(name: name)
                dismiss()
            } catch APIError.notOnPlan {
                notOnPlan = true
            } catch let apiError as APIError {
                error = apiError.userMessage
            } catch {
                self.error = "Failed to create household"
            }
        }
    }
}
