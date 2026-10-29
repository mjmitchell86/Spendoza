import SpendozaKit
import SwiftUI

/// The minimal Me tab: Appearance & Face ID, and Sign out.
struct MeView: View {
    let store: SessionStore
    let lock: AppLock
    @AppStorage(Appearance.defaultsKey) private var appearance: Appearance = .system

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text("Me")
                        .font(.serif(28, relativeTo: .largeTitle))
                        .foregroundStyle(Theme.ink)
                        .accessibilityAddTraits(.isHeader)

                    VStack(alignment: .leading, spacing: 0) {
                        Text("Appearance & Face ID")
                            .font(.serif(20, relativeTo: .title3))
                            .foregroundStyle(Theme.ink)
                            .accessibilityAddTraits(.isHeader)
                            .padding(.bottom, 10)
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

                    Button("Sign out") { Task { await store.signOut() } }
                        .buttonStyle(SecondaryButtonStyle())
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Theme.paper.ignoresSafeArea())
            .toolbarVisibility(.hidden, for: .navigationBar)
        }
    }
}
