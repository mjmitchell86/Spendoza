import SwiftUI

/// Change the display name. Stays open with the server's message when saving fails.
struct EditNameSheet: View {
    let model: MeModel
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var saving = false
    @FocusState private var focused: Bool

    init(model: MeModel) {
        self.model = model
        _name = State(initialValue: model.profile?.displayName ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Your name")
                .font(.serif(22, relativeTo: .title2))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            TextField("Your name", text: $name)
                .font(.sans(16, relativeTo: .body))
                .foregroundStyle(Theme.ink)
                .textContentType(.name)
                .submitLabel(.done)
                .focused($focused)
                .onSubmit(save)
                .padding(12)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
                .hairlineBorder(Theme.engraving)
            if let error = model.error {
                Text(error)
                    .font(.sans(14, relativeTo: .footnote))
                    .foregroundStyle(Theme.oxblood)
            }
            Button(saving ? "Saving…" : "Save", action: save)
                .buttonStyle(PrimaryButtonStyle())
                .disabled(saving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Spacer(minLength: 0)
        }
        .padding(20)
        .background(Theme.paper.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .onAppear {
            model.error = nil
            focused = true
        }
    }

    private func save() {
        guard !saving else { return }
        saving = true
        Task {
            if await model.saveName(name) { dismiss() }
            saving = false
        }
    }
}
