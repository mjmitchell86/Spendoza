import SwiftUI

/// "Set a $X budget": the suggested monthly amount, editable, saved as a budget goal for the category.
struct BudgetSheet: View {
    let categoryName: String
    let suggested: Int
    let defaultName: String
    /// Saves the goal; the sheet reacts to the result.
    let save: (String, Int) async -> BudgetResult
    let onSaved: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text: String
    @State private var name: String
    @State private var busy = false
    @State private var error: String?
    @State private var notOnPlan = false
    @FocusState private var focused: Bool

    init(categoryName: String, suggested: Int, defaultName: String? = nil,
         save: @escaping (String, Int) async -> BudgetResult, onSaved: @escaping () -> Void) {
        self.categoryName = categoryName
        self.suggested = suggested
        self.defaultName = defaultName ?? "\(categoryName) budget"
        self.save = save
        self.onSaved = onSaved
        _text = State(initialValue: String(suggested))
        _name = State(initialValue: defaultName ?? "\(categoryName) budget")
    }

    /// "$1,250" or "150" as a whole-dollar amount above zero; nil for anything else.
    static func amount(from text: String) -> Int? {
        let cleaned = text.filter { !"$, ".contains($0) }
        guard let value = Double(cleaned), value.isFinite, value < 1_000_000_000 else { return nil }
        let rounded = Int(value.rounded())
        return rounded > 0 ? rounded : nil
    }

    var body: some View {
        content
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 20)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Theme.paper.ignoresSafeArea())
            .presentationDetents([.medium])
    }

    var content: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Set a budget for \(categoryName)")
                .font(.serif(22, relativeTo: .title2))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            if notOnPlan {
                PlanNotAvailableView()
                Button("Close") { dismiss() }.buttonStyle(SecondaryButtonStyle())
            } else {
                Text("How much do you want to spend on \(categoryName) in a month?")
                    .font(.sans(15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.soft)
                HStack(spacing: 4) {
                    Text("$").font(.serif(28, relativeTo: .title)).foregroundStyle(Theme.ink)
                    TextField("Amount", text: $text)
                        .keyboardType(.numberPad)
                        .font(.serif(28, relativeTo: .title))
                        .foregroundStyle(Theme.ink)
                        .focused($focused)
                        .accessibilityLabel("Monthly budget in dollars")
                }
                .padding(.horizontal, 12)
                .frame(minHeight: 52)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
                .overlay(RoundedRectangle(cornerRadius: Theme.corner).strokeBorder(Theme.engraving, lineWidth: Theme.hairline))
                Text("Name")
                    .font(.sans(13, relativeTo: .footnote))
                    .foregroundStyle(Theme.soft)
                TextField("Budget name", text: $name)
                    .font(.sans(15, relativeTo: .body))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 12)
                    .frame(minHeight: 44)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
                    .overlay(RoundedRectangle(cornerRadius: Theme.corner).strokeBorder(Theme.engraving, lineWidth: Theme.hairline))
                    .accessibilityLabel("Budget name")
                if let error { InlineError(message: error) }
                BusyButton(title: "Save budget", busy: busy) { Task { await submit() } }
                    .disabled(Self.amount(from: text) == nil || name.trimmingCharacters(in: .whitespaces).isEmpty)
                Button("Cancel") { dismiss() }.buttonStyle(SecondaryButtonStyle())
            }
        }
    }

    private func submit() async {
        guard let amount = Self.amount(from: text) else {
            error = "Enter an amount above $0."
            return
        }
        busy = true
        error = nil
        let result = await save(name, amount)
        busy = false
        switch result {
        case .saved:
            onSaved()
            dismiss()
        case .notOnPlan:
            notOnPlan = true
        case .failed(let message):
            error = message
        }
    }
}
