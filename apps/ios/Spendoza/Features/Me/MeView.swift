import SpendozaKit
import SwiftUI

/// The Me tab: the profile, the Account rows, and Sign out. Each section is its own small view so later sections slot in.
struct MeView: View {
    let store: SessionStore
    let lock: AppLock
    @State private var model: MeModel
    /// Set while the delete-account sheet is up.
    @State private var deleting: DeleteAccountModel?

    init(store: SessionStore, lock: AppLock) {
        self.store = store
        self.lock = lock
        _model = State(initialValue: MeModel(api: store.api, profile: store.profile,
                                             apply: { [weak store] in store?.apply($0) }))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    ProfileHeader(model: model, email: store.email)
                    ReportsSection(model: model, api: store.api)
                    AccountSection(tier: model.profile?.subscriptionTier ?? "free", lock: lock, api: store.api)
                    HelpSection()
                    Button("Sign out") { Task { await store.signOut() } }
                        .buttonStyle(SecondaryButtonStyle())
                    Button("Delete my account") { startDeleting() }
                        .font(.sans(15, weight: .semibold, relativeTo: .callout))
                        .foregroundStyle(Theme.oxblood)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Theme.paper.ignoresSafeArea())
            .sheet(item: $deleting) { DeleteAccountSheet(model: $0) }
            .toolbarVisibility(.hidden, for: .navigationBar)
            .onChange(of: store.profile, initial: true) { _, profile in model.sync(profile) }
        }
    }

    /// Success returns the app to Sign in: the store drops the local session and clears the account's caches.
    private func startDeleting() {
        let store = store
        deleting = DeleteAccountModel(api: store.api) { await store.accountDeleted() }
    }
}

/// A titled group of ruled rows.
struct MeSection<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.serif(20, relativeTo: .title3))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 10)
            VStack(spacing: 0) { content }
                .topRule()
        }
    }
}

/// A row that pushes or opens something: title, optional detail, and a trailing glyph.
struct MeRowLabel: View {
    let title: String
    var detail: String?
    let glyph: String

    var body: some View {
        RuledRow {
            HStack(spacing: 8) {
                Text(title)
                    .font(.sans(16, relativeTo: .body))
                    .foregroundStyle(Theme.ink)
                Spacer(minLength: 8)
                if let detail {
                    Text(detail)
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.soft)
                }
                Text(glyph)
                    .font(.sans(14, relativeTo: .subheadline))
                    .foregroundStyle(Theme.soft)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 34)
            .contentShape(Rectangle())
        }
    }
}

private struct AccountSection: View {
    let tier: String
    let lock: AppLock
    let api: any SpendozaAPI
    static let pricingURL = URL(string: "https://www.spendoza.io/pricing")!

    var body: some View {
        MeSection(title: "Account") {
            NavigationLink {
                AppearanceFaceIDScreen(lock: lock)
            } label: {
                MeRowLabel(title: "Appearance & Face ID", glyph: "›")
            }
            .buttonStyle(.plain)
            NavigationLink {
                InviteCodesView(api: api)
            } label: {
                MeRowLabel(title: "Invite codes", glyph: "›")
            }
            .buttonStyle(.plain)
            NavigationLink {
                AIAssistantsView(api: api)
            } label: {
                MeRowLabel(title: "AI assistants", glyph: "›")
            }
            .buttonStyle(.plain)
            Link(destination: Self.pricingURL) {
                MeRowLabel(title: "Plans & billing", detail: "\(tier.capitalized) plan", glyph: "↗\u{FE0E}")
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens in your browser")
        }
    }
}

private struct HelpSection: View {
    var body: some View {
        MeSection(title: "Help") {
            NavigationLink {
                LegalPageView(name: "support")
            } label: {
                MeRowLabel(title: "Support", glyph: "›")
            }
            .buttonStyle(.plain)
            NavigationLink {
                LegalPageView(name: "privacy")
            } label: {
                MeRowLabel(title: "Privacy", glyph: "›")
            }
            .buttonStyle(.plain)
        }
    }
}

/// The Face ID lock and the theme, moved here from the Me tab itself.
private struct AppearanceFaceIDScreen: View {
    let lock: AppLock
    @AppStorage(Appearance.defaultsKey) private var appearance: Appearance = .system

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Appearance & Face ID")
                    .font(.serif(28, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                VStack(spacing: 0) {
                    RuledRow {
                        Toggle("Lock with Face ID", isOn: Binding(
                            get: { lock.isEnabled },
                            set: { on in Task { await lock.setEnabled(on) } }))
                            .font(.sans(16, relativeTo: .body))
                            .foregroundStyle(Theme.ink)
                            .tint(Theme.note)
                    }
                    RuledRow {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Theme")
                                .font(.sans(16, relativeTo: .body))
                                .foregroundStyle(Theme.ink)
                            Picker("Theme", selection: $appearance) {
                                ForEach(Appearance.allCases, id: \.self) { Text($0.title).tag($0) }
                            }
                            .pickerStyle(.segmented)
                            .labelsHidden()
                        }
                    }
                }
                .topRule()
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Theme.paper.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
    }
}
