import SpendozaKit
import SwiftUI

/// Covers the app while it's locked, and (without the button) while the app is inactive so the app switcher shows nothing.
struct LockView: View {
    let coordinator: LockCoordinator
    /// False for the privacy cover shown while merely inactive.
    var offersUnlock = true

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "lock")
                .font(.system(size: 34, weight: .light))
                .foregroundStyle(Theme.note)
                .accessibilityHidden(true)
            Text("Spendoza is locked")
                .font(.serif(28, relativeTo: .largeTitle))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            if offersUnlock {
                Button("Unlock") { Task { await coordinator.unlockTapped() } }
                    .buttonStyle(PrimaryButtonStyle())
                    .padding(.horizontal, 20)
                    .frame(maxWidth: 320)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.paper.ignoresSafeArea())
    }
}
