import SwiftUI

/// Page layout shared by the signed-out screens: paper background, serif title, scrolling content.
struct AuthScaffold<Content: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(title)
                        .font(.serif(28, relativeTo: .largeTitle))
                        .foregroundStyle(Theme.ink)
                        .accessibilityAddTraits(.isHeader)
                    if let subtitle {
                        Text(subtitle)
                            .font(.sans(15, relativeTo: .subheadline))
                            .foregroundStyle(Theme.soft)
                    }
                }
                content
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.paper.ignoresSafeArea())
        .toolbarBackground(Theme.paper, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// A labelled text field on a `card` fill with an `engraving` hairline border.
struct AuthField: View {
    let label: String
    @Binding var text: String
    var secure = false
    var contentType: UITextContentType?
    var keyboard: UIKeyboardType = .default
    var capitalization: TextInputAutocapitalization = .never

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.sans(13, weight: .semibold, relativeTo: .footnote))
                .foregroundStyle(Theme.soft)
            Group {
                if secure {
                    SecureField("", text: $text)
                } else {
                    TextField("", text: $text)
                        .keyboardType(keyboard)
                        .textInputAutocapitalization(capitalization)
                        .autocorrectionDisabled()
                }
            }
            .textContentType(contentType)
            .font(.sans(16, relativeTo: .body))
            .foregroundStyle(Theme.ink)
            .tint(Theme.note)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.corner)
                    .strokeBorder(Theme.engraving, lineWidth: Theme.hairline)
            )
        }
    }
}

/// An inline error in oxblood, announced to VoiceOver.
struct InlineError: View {
    let message: String

    var body: some View {
        Text(message)
            .font(.sans(14, relativeTo: .footnote))
            .foregroundStyle(Theme.oxblood)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityLabel("Error: \(message)")
    }
}

/// Primary button that shows progress and ignores taps while working.
struct BusyButton: View {
    let title: String
    let busy: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            if busy {
                ProgressView().tint(Theme.onNote)
            } else {
                Text(title)
            }
        }
        .buttonStyle(PrimaryButtonStyle())
        .disabled(busy)
        .accessibilityLabel(busy ? "\(title), working" : title)
    }
}
