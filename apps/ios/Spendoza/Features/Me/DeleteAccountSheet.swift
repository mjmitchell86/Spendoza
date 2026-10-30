import SwiftUI

/// Asks for the word DELETE before the account goes. Stays open with the server's message when it can't be deleted.
struct DeleteAccountSheet: View {
    let model: DeleteAccountModel
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focused: Bool

    var body: some View {
        @Bindable var model = model
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Delete your account?")
                    .font(.serif(22, relativeTo: .title2))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                Text("This permanently deletes your account and your data: profile, statements and transactions, income, expenses, goals, debts, reports, advice history, email settings and uploaded files, and cancels any subscription. This cannot be undone.")
                    .font(.sans(15, relativeTo: .callout))
                    .foregroundStyle(Theme.soft)
                    .fixedSize(horizontal: false, vertical: true)
                VStack(alignment: .leading, spacing: 8) {
                    Text("Type DELETE to confirm")
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.ink)
                    TextField("DELETE", text: $model.typed)
                        .font(.sans(16, relativeTo: .body))
                        .foregroundStyle(Theme.ink)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .submitLabel(.done)
                        .focused($focused)
                        .disabled(model.deleting)
                        .padding(12)
                        .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
                        .hairlineBorder(Theme.engraving)
                }
                if let error = model.error {
                    Text(error)
                        .font(.sans(14, relativeTo: .footnote))
                        .foregroundStyle(Theme.oxblood)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button(model.deleting ? "Deleting…" : "Delete my account") { Task { await model.delete() } }
                    .buttonStyle(DestructiveButtonStyle())
                    .disabled(!model.canDelete || model.deleting)
                Button("Cancel") { dismiss() }
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(model.deleting)
            }
            .padding(20)
        }
        .background(Theme.paper.ignoresSafeArea())
        .presentationDetents([.large])
        .interactiveDismissDisabled(model.deleting)
        .onAppear {
            model.error = nil
            focused = true
        }
    }
}

/// Filled oxblood button for the one irreversible action.
private struct DestructiveButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.sans(15, weight: .semibold, relativeTo: .callout))
            .foregroundStyle(Theme.onNote)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(Theme.oxblood, in: RoundedRectangle(cornerRadius: Theme.corner))
            .opacity(isEnabled ? (configuration.isPressed ? 0.85 : 1) : 0.4)
    }
}
