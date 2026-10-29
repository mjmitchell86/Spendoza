import SwiftUI

/// Stands in for the Health tab until Task 9 builds the real screen (which deletes this file).
struct HealthPlaceholderView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Your money's health")
                .font(.serif(28, relativeTo: .largeTitle))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            Text("Your check-up will appear here.")
                .font(.sans(15, relativeTo: .subheadline))
                .foregroundStyle(Theme.soft)
        }
        .padding(.horizontal, 20)
        .padding(.top, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.paper.ignoresSafeArea())
    }
}
