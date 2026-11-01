import SpendozaKit
import SwiftUI

/// Home with a household: members, the head's invite tools and settings, your sharing preferences, and Leave.
struct HouseholdView: View {
    let household: Household
    @State private var model: HouseholdModel
    @State private var sharing: SharingSettingsModel

    init(store: SessionStore, home: HomeModel, household: Household) {
        self.household = household
        let reload: @MainActor () async -> Void = { await home.load() }
        _model = State(initialValue: HouseholdModel(api: store.api, selfID: { [store] in store.profile?.id },
                                                    household: household, reload: reload))
        _sharing = State(initialValue: SharingSettingsModel(api: store.api, reload: reload))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            Text(model.household.name)
                .font(.serif(22, relativeTo: .title2))
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
            MembersSection(model: model)
            if model.isHead {
                InviteCodeCard(model: model)
                InviteByEmailSheet(model: model)
                if !model.pending.isEmpty { PendingInvitationsSection(model: model) }
            }
            SharingSettingsView(model: sharing)
            if model.isHead { HouseholdSettingsView(model: model) }
            LeaveSection(model: model)
        }
        .onChange(of: household) { _, new in model.sync(new) }
        .task(id: model.isHead) { await model.loadPending() }
    }
}
