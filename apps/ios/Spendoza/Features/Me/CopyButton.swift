import SwiftUI
import UIKit

/// "Copy" that reads "Copied" for two seconds; the pasteboard entry expires after five minutes. At least 44 pt tall.
struct CopyButton: View {
    let text: String
    var label = "Copy"
    @State private var copied = false

    var body: some View {
        Button(copied ? "Copied" : "Copy") {
            UIPasteboard.general.setItems([[UIPasteboard.typeAutomatic: text]],
                                          options: [.expirationDate: Date.now.addingTimeInterval(300)])
            copied = true
            Task {
                try? await Task.sleep(for: .seconds(2))
                copied = false
            }
        }
        .font(.sans(14, relativeTo: .subheadline))
        .foregroundStyle(Theme.note)
        .frame(minWidth: 44, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityLabel(copied ? "Copied" : label)
    }
}
