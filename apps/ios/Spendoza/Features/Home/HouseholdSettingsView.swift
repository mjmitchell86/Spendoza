import SpendozaKit
import SwiftUI

/// The head's household settings: rename, and delete behind a type-the-name confirmation.
struct HouseholdSettingsView: View {
    let model: HouseholdModel
    @State private var name: String
    @State private var deleting = false

    init(model: HouseholdModel) {
        self.model = model
        _name = State(initialValue: model.household.name)
    }

    private var canRename: Bool { model.canRename(name) && model.working == nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Household settings")
                .font(.serif(20, relativeTo: .title3))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            AuthField(label: "Household name", text: $name, capitalization: .words)
                .onChange(of: name) { if name.count > 100 { name = String(name.prefix(100)) } }
            Button { Task { await model.rename(to: name) } } label: {
                Text(model.working == .renaming ? "Renaming…" : "Rename household")
            }
            .buttonStyle(SecondaryButtonStyle())
            .disabled(!canRename)
            .opacity(canRename || model.working == .renaming ? 1 : 0.45)
            .onChange(of: model.household.name) { name = model.household.name }
            if let error = model.settingsError, !deleting { AreaErrorView(error: error) }
            Text("Deleting removes the household and its shared reports, goals and debts. Everyone's personal data stays.")
                .font(.sans(14, relativeTo: .subheadline))
                .foregroundStyle(Theme.soft)
                .fixedSize(horizontal: false, vertical: true)
            Button("Delete household") {
                model.clearSettingsError()
                deleting = true
            }
            .buttonStyle(OutlinedDestructiveButtonStyle())
            .disabled(model.working != nil)
        }
        .sheet(isPresented: $deleting) { DeleteHouseholdSheet(model: model) }
    }
}

/// Asks for the household's name before it is deleted. Stays open with the server's words when it can't be.
private struct DeleteHouseholdSheet: View {
    let model: HouseholdModel
    @Environment(\.dismiss) private var dismiss
    @State private var typed = ""
    @FocusState private var focused: Bool

    private var canDelete: Bool { HouseholdModel.canDelete(typed: typed, name: model.household.name) }
    private var deleting: Bool { model.working == .deleting }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Delete household")
                    .font(.serif(22, relativeTo: .title2))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                Text("This permanently deletes \(model.household.name) and cannot be undone.")
                    .font(.sans(15, relativeTo: .callout))
                    .foregroundStyle(Theme.soft)
                    .fixedSize(horizontal: false, vertical: true)
                VStack(alignment: .leading, spacing: 8) {
                    Text("Type the household name to confirm")
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.ink)
                    TextField(model.household.name, text: $typed)
                        .font(.sans(16, relativeTo: .body))
                        .foregroundStyle(Theme.ink)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .submitLabel(.done)
                        .focused($focused)
                        .disabled(deleting)
                        .padding(12)
                        .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
                        .hairlineBorder(Theme.engraving)
                        .accessibilityLabel("Type the household name to confirm")
                }
                if let error = model.settingsError { AreaErrorView(error: error) }
                Button(deleting ? "Deleting…" : "Delete household") {
                    Task { if await model.deleteHousehold(typed: typed) { dismiss() } }
                }
                .buttonStyle(DestructiveButtonStyle())
                .disabled(!canDelete || deleting)
                Button("Cancel") { dismiss() }
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(deleting)
            }
            .padding(20)
        }
        .background(Theme.paper.ignoresSafeArea())
        .presentationDetents([.large])
        .interactiveDismissDisabled(deleting)
        .onAppear { focused = true }
    }
}

/// Leaving the household, at the bottom of the screen. A head with other members must hand over first.
struct LeaveSection: View {
    let model: HouseholdModel
    @State private var confirming = false

    var body: some View {
        let plan = model.leave
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(plan.rowTitle)
                    .font(.sans(16, weight: .semibold, relativeTo: .body))
                    .foregroundStyle(Theme.ink)
                Text(plan.subtext)
                    .font(.sans(14, relativeTo: .subheadline))
                    .foregroundStyle(Theme.soft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button { confirming = true } label: {
                Text(model.working == .leaving ? "Leaving…" : plan.buttonTitle)
            }
            .buttonStyle(OutlinedDestructiveButtonStyle())
            .disabled(plan.isDisabled || model.working != nil)
            .opacity(plan.isDisabled || (model.working != nil && model.working != .leaving) ? 0.45 : 1)
            if let error = model.leaveError { AreaErrorView(error: error) }
        }
        .padding(.top, 12)
        .topRule()
        .alert(plan.dialogTitle, isPresented: $confirming) {
            Button("Cancel", role: .cancel) {}
            Button("Leave", role: .destructive) { Task { await model.leaveHousehold() } }
        } message: {
            Text(plan.dialogBody)
        }
    }
}
