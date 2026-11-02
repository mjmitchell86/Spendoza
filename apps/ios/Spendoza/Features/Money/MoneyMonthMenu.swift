import SwiftUI

/// The month menu at the top of the Money tab: "October so far" and the 11 months before it, and Export PDF for
/// the month shown.
struct MoneyMonthMenu: View {
    let model: MoneyModel
    let canExport: Bool
    let exporting: Bool
    let onExport: () -> Void

    var body: some View {
        Menu {
            ForEach(model.choices) { choice in
                Button {
                    model.select(choice.month)
                } label: {
                    if choice.month == model.selected { Label(choice.title, systemImage: "checkmark") }
                    else { Text(choice.title) }
                }
            }
            Divider()
            Button(exporting ? "Exporting…" : "Export PDF", systemImage: "arrow.down.doc", action: onExport)
                .disabled(!canExport || exporting)
        } label: {
            HStack(spacing: 4) {
                Text(model.selectedTitle)
                Image(systemName: "chevron.down").font(.system(size: 11, weight: .semibold))
            }
            .font(.sans(14, relativeTo: .subheadline))
            .foregroundStyle(Theme.note)
            .frame(minHeight: 44, alignment: .leading)
        }
        .accessibilityLabel(model.selectedTitle)
        .accessibilityHint("Choose another month or export a PDF")
    }
}
