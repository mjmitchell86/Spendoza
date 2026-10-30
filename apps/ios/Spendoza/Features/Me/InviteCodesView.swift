import SpendozaKit
import SwiftUI

/// The invite codes screen: the codes with Copy and Share on the available ones, and Create code.
struct InviteCodesView: View {
    @State private var model: InviteCodesModel

    init(api: any SpendozaAPI) {
        _model = State(initialValue: InviteCodesModel(api: api))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Invite codes")
                    .font(.serif(28, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                Text("Share codes with others to let them join Spendoza. You can create up to 3 codes.")
                    .font(.sans(16, relativeTo: .body))
                    .foregroundStyle(Theme.soft)
                if let error = model.error {
                    Text(error)
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.oxblood)
                        .accessibilityLabel("Error: \(error)")
                }
                if model.loaded {
                    if model.codes.isEmpty {
                        Text("No invite codes yet. Create one to share.")
                            .font(.sans(14, relativeTo: .subheadline))
                            .foregroundStyle(Theme.soft)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(model.codes) { row($0) }
                        }
                        .topRule()
                    }
                    Text(model.footer)
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.soft)
                    Button(model.creating ? "Creating…" : "Create code") { Task { await model.create() } }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(!model.canCreate || model.creating)
                        .opacity(model.canCreate ? 1 : 0.45)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Theme.paper.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
    }

    private func row(_ invite: InviteCode) -> some View {
        RuledRow {
            VStack(alignment: .leading, spacing: 8) {
                // Side by side when they fit; stacked at the large text sizes, where the code would clip.
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) {
                        codeText(invite).fixedSize()
                        Spacer(minLength: 8)
                        status(invite)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        codeText(invite)
                        status(invite)
                    }
                }
                if !invite.isUsed {
                    HStack(spacing: 12) {
                        CopyButton(text: invite.code, label: "Copy code")
                        ShareLink(item: InviteCodesModel.shareText(invite.code)) { Text("Share") }
                            .font(.sans(14, relativeTo: .subheadline))
                            .foregroundStyle(Theme.note)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                            .accessibilityLabel("Share code")
                    }
                }
            }
            .frame(minHeight: 34)
        }
    }

    private func codeText(_ invite: InviteCode) -> some View {
        Text(invite.code)
            .font(.system(.title3, design: .monospaced, weight: .medium))
            .foregroundStyle(invite.isUsed ? Theme.soft : Theme.ink)
            .fixedSize(horizontal: false, vertical: true)
            .textSelection(.enabled)
    }

    private func status(_ invite: InviteCode) -> some View {
        Text(invite.isUsed ? "Used" : "Available")
            .font(.sans(14, relativeTo: .subheadline))
            .foregroundStyle(Theme.soft)
            .fixedSize()
    }
}
