import SwiftUI

/// Support or Privacy, rendered from the shared text. Links to the other Help screen switch in place.
struct LegalPageView: View {
    @State private var name: String
    @State private var page: LegalPage?
    @State private var failed = false

    init(name: String) { _name = State(initialValue: name) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                if let page {
                    content(page)
                } else if failed {
                    Text("This page couldn't be loaded.")
                        .font(.sans(16, relativeTo: .body))
                        .foregroundStyle(Theme.soft)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .id(name) // a new page starts at the top, not at the old page's scroll offset
        .background(Theme.paper.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .tint(Theme.ink)
        .environment(\.openURL, OpenURLAction { url in
            guard let other = LegalPage.helpScreen(for: url) else { return .systemAction }
            if other != name { name = other }
            return .handled
        })
        .task(id: name) {
            do { page = try LegalPage.load(name); failed = false } catch { page = nil; failed = true }
        }
    }

    @ViewBuilder private func content(_ page: LegalPage) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(page.title)
                .font(.serif(28, relativeTo: .largeTitle))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            ForEach(page.intro, id: \.self) { paragraph($0, color: Theme.soft) }
            if let effective = page.effective {
                Text("Effective \(effective)")
                    .font(.sans(14, relativeTo: .subheadline))
                    .foregroundStyle(Theme.soft)
            }
        }
        ForEach(page.sections, id: \.heading) { section in
            VStack(alignment: .leading, spacing: 10) {
                Text(section.heading)
                    .font(.serif(20, relativeTo: .title3))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                ForEach(Array(section.blocks.enumerated()), id: \.offset) { _, block in
                    switch block {
                    case .p(let text): paragraph(text)
                    case .ol(let items): list(items, ordered: true)
                    case .ul(let items): list(items, ordered: false)
                    }
                }
            }
        }
        paragraph(page.footer, color: Theme.soft, size: 14)
            .padding(.top, 16)
            .topRule()
    }

    private func paragraph(_ text: String, color: Color = Theme.ink, size: CGFloat = 16) -> some View {
        Text(LegalPage.attributed(text))
            .font(.sans(size, relativeTo: .body))
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func list(_ items: [String], ordered: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(ordered ? "\(index + 1)." : "•")
                        .font(.sans(16, relativeTo: .body))
                        .foregroundStyle(Theme.soft)
                        .frame(minWidth: 22, alignment: .trailing)
                        .accessibilityHidden(true)
                    paragraph(item)
                }
            }
        }
    }
}
