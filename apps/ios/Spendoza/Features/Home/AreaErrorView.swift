import SwiftUI

/// An action's failure, inline: the plan notice with its link for a plan refusal, the server's words otherwise.
struct AreaErrorView: View {
    let error: AreaError

    var body: some View {
        switch error {
        case .plan: PlanNotAvailableView()
        case .message(let text): InlineError(message: text)
        }
    }
}
