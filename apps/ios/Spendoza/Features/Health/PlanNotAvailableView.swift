import SwiftUI

/// Shown when the server says an action needs a plan the person isn't on (403 with `required_tier`).
struct PlanNotAvailableView: View {
    static let pricingURL = URL(string: "https://www.spendoza.io/pricing")!

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Not available on your plan yet")
                .font(.serif(17, relativeTo: .headline))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            Link(destination: Self.pricingURL) {
                Text("Plans & billing")
                    .font(.sans(15, weight: .semibold, relativeTo: .callout))
                    .foregroundStyle(Theme.note)
                    .frame(minHeight: 44, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
