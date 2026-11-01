import SpendozaKit
import SwiftUI

/// Everyone in the household with how they share; the head can hand over or remove the others.
struct MembersSection: View {
    let model: HouseholdModel
    @State private var removing: Member?
    @State private var transferring: Member?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            MeSection(title: "Members") {
                ForEach(model.sortedMembers) { member in
                    row(member)
                }
            }
            if let error = model.memberError { AreaErrorView(error: error) }
        }
    }

    private func row(_ member: Member) -> some View {
        RuledRow {
            VStack(alignment: .leading, spacing: 6) {
                Text(model.title(for: member))
                    .font(.sans(16, weight: .semibold, relativeTo: .body))
                    .foregroundStyle(Theme.ink)
                Text(HouseholdModel.sharingLine(member))
                    .font(.sans(13, relativeTo: .footnote))
                    .foregroundStyle(Theme.soft)
                if model.isHead, member.id != model.household.headID {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 10) { transfer(member); remove(member) }
                        VStack(spacing: 10) { transfer(member); remove(member) }
                    }
                    .padding(.top, 4)
                }
            }
            .frame(minHeight: 34, alignment: .leading)
        }
        .alert("Remove from household", isPresented: Binding(get: { removing?.id == member.id }, set: { if !$0 { removing = nil } })) {
            Button("Cancel", role: .cancel) {}
            Button("Remove from household", role: .destructive) { Task { await model.remove(member) } }
        } message: {
            Text(HouseholdModel.removeBody(member))
        }
        .alert("Make head of household", isPresented: Binding(get: { transferring?.id == member.id }, set: { if !$0 { transferring = nil } })) {
            Button("Cancel", role: .cancel) {}
            Button("Make head of household") { Task { await model.makeHead(member) } }
        } message: {
            Text(HouseholdModel.transferBody(member))
        }
    }

    private func transfer(_ member: Member) -> some View {
        let busy = model.working == .transferring(member.id)
        return Button { transferring = member } label: {
            Text(busy ? "Transferring…" : "Make head of household")
        }
        .buttonStyle(SecondaryButtonStyle())
        .disabled(model.working != nil)
        .opacity(model.working == nil || busy ? 1 : 0.5)
        .accessibilityLabel("Make head of household, \(member.displayName)")
    }

    private func remove(_ member: Member) -> some View {
        let busy = model.working == .removing(member.id)
        return Button { removing = member } label: {
            Text(busy ? "Removing…" : "Remove from household")
        }
        .buttonStyle(OutlinedDestructiveButtonStyle())
        .disabled(model.working != nil)
        .opacity(model.working == nil || busy ? 1 : 0.5)
        .accessibilityLabel("Remove from household, \(member.displayName)")
    }
}
