import SpendozaKit
import SwiftUI

/// The Home tab: the household, or Create / Join and your invitations when there is none.
struct HomeView: View {
    let store: SessionStore
    @State private var model: HomeModel

    init(store: SessionStore) {
        self.store = store
        _model = State(initialValue: HomeModel(api: store.api, selfID: { [store] in store.profile?.id }))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Household")
                        .font(.serif(28, relativeTo: .largeTitle))
                        .foregroundStyle(Theme.ink)
                        .accessibilityAddTraits(.isHeader)
                    if let notice { noticePanel(notice) }
                    content
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Theme.paper.ignoresSafeArea())
            .toolbarVisibility(.hidden, for: .navigationBar)
            .refreshable { await model.load() }
            .task { await model.load() }
        }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            ProgressView().tint(Theme.note).frame(maxWidth: .infinity).accessibilityLabel("Loading")
        case .none(let invitations):
            NoHouseholdView(model: model, invitations: invitations)
        case .member(let household, _):
            HouseholdView(store: store, home: model, household: household)
        case .notOnPlan:
            PlanNotAvailableView()
        case .failed(let message):
            InlineError(message: message)
            Button("Retry") { Task { await model.load() } }.buttonStyle(SecondaryButtonStyle())
        }
    }

    /// What sign-up said about the code entered, once the household (if joined) is known.
    private var notice: String? {
        guard let result = store.signUpNotice else { return nil }
        var name: String?
        switch model.state {
        case .loading: return nil
        case .member(let household, _): name = household.name
        default: break
        }
        return HomeModel.signUpNotice(result, householdName: name)
    }

    private func noticePanel(_ text: String) -> some View {
        OutlinedPanel {
            HStack(alignment: .center, spacing: 8) {
                Text(text)
                Spacer(minLength: 8)
                Button("Dismiss") { store.dismissSignUpNotice() }
                    .font(.sans(14, weight: .semibold, relativeTo: .subheadline))
                    .foregroundStyle(Theme.note)
                    .frame(minWidth: 44, minHeight: 44)
            }
        }
    }
}
