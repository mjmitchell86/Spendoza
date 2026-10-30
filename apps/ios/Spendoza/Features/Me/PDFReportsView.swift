import QuickLook
import SpendozaKit
import SwiftUI

/// The periods to export as a PDF; tapping one downloads it and opens it in Quick Look (Share / Save from there).
struct PDFReportsView: View {
    @State private var model: PDFReportsModel
    @State private var preview: URL?

    init(api: any SpendozaAPI) {
        _model = State(initialValue: PDFReportsModel(api: api, now: .now, calendar: .current))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("PDF reports")
                    .font(.serif(28, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                if let error = model.error {
                    Text(error)
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.oxblood)
                        .accessibilityLabel("Error: \(error)")
                }
                VStack(spacing: 0) {
                    ForEach(model.options) { option in
                        Button { Task { preview = await model.export(option) } } label: {
                            RuledRow {
                                HStack(spacing: 8) {
                                    Text(model.exporting == option.id ? "Exporting…" : option.title)
                                        .font(.sans(16, relativeTo: .body))
                                        .foregroundStyle(Theme.ink)
                                    Spacer(minLength: 8)
                                    if model.exporting == option.id {
                                        ProgressView().tint(Theme.note)
                                    }
                                }
                                .frame(minHeight: 34)
                                .contentShape(Rectangle())
                            }
                        }
                        .buttonStyle(.plain)
                        .disabled(model.exporting != nil)
                        .accessibilityLabel(option.title)
                        .accessibilityHint("Exports a PDF")
                    }
                }
                .topRule()
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Theme.paper.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .quickLookPreview($preview)
        .onChange(of: preview) { old, new in
            if new == nil, let old { PDFReportsModel.discard(old) }
        }
    }
}
