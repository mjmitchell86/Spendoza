import SpendozaKit
import SwiftUI

/// "User management": a searchable, filterable list of every user, 25 at a time, each opening its own screen.
struct AdminUsersView: View {
    let api: any SpendozaAPI
    /// The signed-in admin, who can't delete themselves.
    let selfID: String?
    @State private var model: AdminUsersModel

    init(api: any SpendozaAPI, selfID: String?) {
        self.api = api
        self.selfID = selfID
        _model = State(initialValue: AdminUsersModel(api: api))
    }

    private static let tiers: [(value: String?, title: String)] =
        [(nil, "All tiers"), ("free", "Free"), ("starter", "Starter"), ("pro", "Pro")]

    /// What a reload depends on: when it changes, the list starts over (after a short pause while typing).
    private struct Filter: Equatable {
        let search: String
        let tier: String?
    }

    var body: some View {
        @Bindable var model = model
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("User management")
                        .font(.serif(28, relativeTo: .largeTitle))
                        .foregroundStyle(Theme.ink)
                        .accessibilityAddTraits(.isHeader)
                    if model.loaded {
                        Text("\(model.total) total users")
                            .font(.sans(16, relativeTo: .body))
                            .foregroundStyle(Theme.soft)
                    }
                }
                searchField($model.search)
                tierMenu
                if let error = model.error {
                    Text(error)
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.oxblood)
                        .accessibilityLabel("Error: \(error)")
                }
                list
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Theme.paper.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        // Typing waits 300 ms for the next key; the first load and a tier change go straight away.
        .task(id: Filter(search: model.search, tier: model.tier)) { await model.filtersChanged() }
    }

    private func searchField(_ text: Binding<String>) -> some View {
        TextField("Search by name", text: text)
            .font(.sans(16, relativeTo: .body))
            .foregroundStyle(Theme.ink)
            .autocorrectionDisabled()
            .submitLabel(.search)
            .padding(12)
            .frame(minHeight: 44)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
            .hairlineBorder(Theme.engraving)
    }

    private var tierMenu: some View {
        let current = Self.tiers.first { $0.value == model.tier }?.title ?? "All tiers"
        return Menu {
            ForEach(Self.tiers, id: \.title) { option in
                Button(option.title) { model.tier = option.value }
            }
        } label: {
            HStack(spacing: 8) {
                Text(current)
                Text("▾").accessibilityHidden(true)
            }
            .font(.sans(15, weight: .semibold, relativeTo: .callout))
            .foregroundStyle(Theme.note)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .hairlineBorder(Theme.note)
        }
        .accessibilityLabel("Tier")
        .accessibilityValue(current)
    }

    @ViewBuilder private var list: some View {
        if model.loaded && model.users.isEmpty {
            Text("No users found.")
                .font(.sans(14, relativeTo: .subheadline))
                .foregroundStyle(Theme.soft)
        } else if !model.users.isEmpty {
            LazyVStack(spacing: 0) {
                ForEach(model.users) { user in
                    NavigationLink {
                        AdminUserDetailView(user: user, api: api, isSelf: user.id == selfID,
                                            onChange: { model.replace($0) }, onDeleted: { model.remove(id: user.id) })
                    } label: {
                        row(user)
                    }
                    .buttonStyle(.plain)
                }
                if model.canLoadMore { loadMore }
            }
            .topRule()
        } else if !model.loaded && model.error == nil {
            Text("Loading…")
                .font(.sans(14, relativeTo: .subheadline))
                .foregroundStyle(Theme.soft)
        }
    }

    private var loadMore: some View {
        Button(model.loading ? "Loading…" : "Load more") { Task { await model.loadMore() } }
            .buttonStyle(SecondaryButtonStyle())
            .disabled(model.loading)
            .padding(.top, 16)
            .onAppear { Task { await model.loadMore() } }
    }

    private func row(_ user: AdminUser) -> some View {
        RuledRow {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(user.displayName)
                        .font(.sans(16, weight: .semibold, relativeTo: .body))
                        .foregroundStyle(Theme.ink)
                    Text(user.email ?? "No email")
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.soft)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(marks(user))
                        .font(.sans(13, relativeTo: .footnote))
                        .foregroundStyle(user.disabled ? Theme.oxblood : Theme.soft)
                }
                Spacer(minLength: 8)
                Text("›")
                    .font(.sans(14, relativeTo: .subheadline))
                    .foregroundStyle(Theme.soft)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .accessibilityElement(children: .combine)
    }

    private func marks(_ user: AdminUser) -> String {
        var parts = [AdminUserDetailView.tierTitle(user.tier)]
        if user.isAdmin { parts.append("Admin") }
        if user.disabled { parts.append("Disabled") }
        return parts.joined(separator: " · ")
    }
}
