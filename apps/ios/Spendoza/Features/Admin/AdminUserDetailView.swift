import SpendozaKit
import SwiftUI

/// One user: tier, Admin and Disabled, the report actions, and Delete user.
struct AdminUserDetailView: View {
    @State private var model: AdminUserDetailModel
    @State private var confirmingDelete = false
    @Environment(\.dismiss) private var dismiss

    init(user: AdminUser, api: any SpendozaAPI, isSelf: Bool,
         onChange: @escaping (AdminUser) -> Void, onDeleted: @escaping () -> Void) {
        _model = State(initialValue: AdminUserDetailModel(user: user, api: api, isSelf: isSelf,
                                                          onChange: onChange, onDeleted: onDeleted))
    }

    static let tiers: [(value: String, title: String)] = [("free", "Free"), ("starter", "Starter"), ("pro", "Pro")]

    static func tierTitle(_ tier: String) -> String {
        tiers.first { $0.value == tier }?.title ?? tier.capitalized
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(model.user.displayName)
                        .font(.serif(28, relativeTo: .largeTitle))
                        .foregroundStyle(Theme.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text(model.user.email ?? "No email")
                        .font(.sans(16, relativeTo: .body))
                        .foregroundStyle(Theme.soft)
                        // One line, shrunk to fit: an address broken mid-word reads as gibberish.
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        // The address as a value: the audit rejects it as a label ("not human-readable").
                        .accessibilityLabel("Email")
                        .accessibilityValue(model.user.email ?? "none")
                }
                if let error = model.error {
                    Text(error)
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.oxblood)
                        .accessibilityLabel("Error: \(error)")
                }
                VStack(spacing: 0) {
                    tierRow
                    if model.canChangeAccess {
                        toggleRow("Admin", isOn: model.user.isAdmin) { await model.setAdmin($0) }
                        toggleRow("Disabled", isOn: model.user.disabled) { await model.setDisabled($0) }
                    }
                }
                .topRule()
                if !model.canChangeAccess {
                    Text(model.selfLockoutNote)
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.soft)
                }
                VStack(spacing: 0) {
                    ForEach(AdminAction.allCases, id: \.self) { actionRow($0) }
                }
                .topRule()
                if model.canDelete { deleteButton }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Theme.paper.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: model.deleted) { _, deleted in if deleted { dismiss() } }
        .alert("Delete user", isPresented: $confirmingDelete) {
            Button("Cancel", role: .cancel) {}
            Button("Delete user", role: .destructive) { Task { await model.delete() } }
        } message: {
            Text(model.confirmation)
        }
    }

    private var tierRow: some View {
        RuledRow {
            HStack(spacing: 8) {
                Text("Tier")
                    .font(.sans(16, relativeTo: .body))
                    .foregroundStyle(Theme.ink)
                Spacer(minLength: 8)
                Menu {
                    ForEach(Self.tiers, id: \.value) { option in
                        Button(option.title) { Task { await model.setTier(option.value) } }
                    }
                } label: {
                    HStack(spacing: 6) {
                        Text(Self.tierTitle(model.user.tier))
                        Text("▾").accessibilityHidden(true)
                    }
                    .font(.sans(16, weight: .semibold, relativeTo: .body))
                    .foregroundStyle(Theme.note)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .accessibilityLabel("Tier")
                .accessibilityValue(Self.tierTitle(model.user.tier))
            }
            .frame(minHeight: 34)
        }
    }

    private func toggleRow(_ title: String, isOn: Bool, set: @escaping (Bool) async -> Void) -> some View {
        RuledRow {
            Toggle(isOn: Binding(get: { isOn }, set: { value in Task { await set(value) } })) {
                Text(title)
                    .font(.sans(16, relativeTo: .body))
                    .foregroundStyle(Theme.ink)
            }
            .tint(Theme.note)
            .frame(minHeight: 34)
        }
    }

    private func actionRow(_ action: AdminAction) -> some View {
        RuledRow {
            VStack(alignment: .leading, spacing: 4) {
                Button { Task { await model.run(action) } } label: {
                    HStack(spacing: 8) {
                        Text(model.running == action ? "Working…" : action.title)
                            .font(.sans(16, relativeTo: .body))
                            .foregroundStyle(Theme.note)
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: 34)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(model.running != nil)
                .accessibilityLabel(action.title)
                if let result = model.results[action] {
                    Text(result.text)
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(result.failed ? Theme.oxblood : Theme.soft)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var deleteButton: some View {
        Button { confirmingDelete = true } label: {
            Text(model.deleting ? "Deleting…" : "Delete user")
                .font(.sans(15, weight: .semibold, relativeTo: .callout))
                .foregroundStyle(Theme.oxblood)
                .frame(maxWidth: .infinity, minHeight: 44)
                .hairlineBorder(Theme.oxblood)
        }
        .buttonStyle(.plain)
        .disabled(model.deleting)
    }
}
