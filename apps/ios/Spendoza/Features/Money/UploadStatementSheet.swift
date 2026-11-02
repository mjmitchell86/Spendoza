import SpendozaKit
import SwiftUI
import UniformTypeIdentifiers

/// "Upload statements": choose PDFs or CSVs, say whose account they are, and send them one after another. The
/// sheet closes when every file went; otherwise the files that failed stay, each with its reason.
struct UploadStatementSheet: View {
    let model: StatementsModel
    @Environment(\.dismiss) private var dismiss
    @State private var picking = false
    @State private var files: [URL] = []
    /// Files from the picker, whose access this sheet releases.
    @State private var held: [URL] = []
    @State private var bankName = ""
    @State private var shared = false
    @State private var accountLabel = ""
    @State private var problems: [String: String] = [:]
    @State private var uploading = false
    @State private var uploadTask: Task<Void, Never>?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Upload statements")
                    .font(.serif(22, relativeTo: .title2))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                dropZone
                if !files.isEmpty { queue }
                AuthField(label: "Bank name (optional)", text: $bankName, capitalization: .words)
                    .disabled(uploading)
                bankSuggestions
                sharedSwitch
                Label("Your bank statement file is deleted once processing finishes (or when you remove a failed upload). We keep the extracted transactions, not the file.",
                      systemImage: "checkmark.shield")
                    .font(.sans(13, relativeTo: .footnote))
                    .foregroundStyle(Theme.soft)
                buttons
            }
            .padding(20)
        }
        .background(Theme.paper.ignoresSafeArea())
        .presentationDetents([.large])
        .interactiveDismissDisabled(uploading)
        .fileImporter(isPresented: $picking, allowedContentTypes: [.pdf, .commaSeparatedText], allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            add(urls.filter { $0.startAccessingSecurityScopedResource() }, picked: urls)
        }
        .onDisappear {
            // Closed (or signed out) mid-upload: the rest of the files are not sent.
            uploadTask?.cancel()
            held.forEach { $0.stopAccessingSecurityScopedResource() }
        }
    }

    // MARK: Pieces

    private var dropZone: some View {
        Button { picking = true } label: {
            VStack(spacing: 8) {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 30))
                    .foregroundStyle(Theme.note)
                    .accessibilityHidden(true)
                Text("Choose PDFs or CSVs")
                    .font(.sans(15, weight: .semibold, relativeTo: .body))
                    .foregroundStyle(Theme.ink)
                Text("Max \(APIClient.maxStatementMB) MB per file")
                    .font(.sans(13, relativeTo: .footnote))
                    .foregroundStyle(Theme.soft)
            }
            .frame(maxWidth: .infinity, minHeight: 120)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
            .hairlineBorder(Theme.engraving, dash: [5, 4])
        }
        .buttonStyle(.plain)
        .disabled(uploading)
        .accessibilityLabel("Choose PDFs or CSVs")
        .accessibilityHint("Max \(APIClient.maxStatementMB) MB per file")
    }

    private var queue: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(files.count == 1 ? "1 file selected" : "\(files.count) files selected")
                .font(.sans(14, weight: .semibold, relativeTo: .footnote))
                .foregroundStyle(Theme.ink)
                .padding(.bottom, 6)
            VStack(spacing: 0) {
                ForEach(files, id: \.self) { url in
                    RuledRow {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(url.lastPathComponent)
                                    .font(.sans(15, relativeTo: .body))
                                    .foregroundStyle(Theme.ink)
                                    .lineLimit(2)
                                Spacer(minLength: 4)
                                Button { remove(url) } label: {
                                    Image(systemName: "xmark")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(Theme.soft)
                                        .frame(width: 44, height: 44)
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .disabled(uploading)
                                .accessibilityLabel("Remove \(url.lastPathComponent)")
                            }
                            if let problem = problems[url.lastPathComponent] {
                                Text(problem)
                                    .font(.sans(13, relativeTo: .footnote))
                                    .foregroundStyle(Theme.oxblood)
                            }
                        }
                    }
                }
            }
            .topRule()
        }
    }

    @ViewBuilder private var bankSuggestions: some View {
        let names = model.bankNames.filter { $0.caseInsensitiveCompare(bankName) != .orderedSame }
        if !names.isEmpty, !uploading {
            Menu {
                ForEach(names, id: \.self) { name in Button(name) { bankName = name } }
            } label: {
                Text("Use a bank you added before")
                    .font(.sans(14, weight: .semibold, relativeTo: .footnote))
                    .foregroundStyle(Theme.note)
                    .frame(minHeight: 44, alignment: .leading)
            }
        }
    }

    private var sharedSwitch: some View {
        VStack(alignment: .leading, spacing: 12) {
            Toggle(isOn: $shared) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Shared account")
                        .font(.sans(15, weight: .semibold, relativeTo: .body))
                        .foregroundStyle(Theme.ink)
                    Text("This account is shared with household members")
                        .font(.sans(13, relativeTo: .footnote))
                        .foregroundStyle(Theme.soft)
                }
            }
            .tint(Theme.note)
            .frame(minHeight: 44)
            .disabled(uploading)
            if shared {
                AuthField(label: "Account label", text: $accountLabel, capitalization: .words, placeholder: "e.g. Joint Checking")
                    .disabled(uploading)
            }
        }
    }

    private var buttons: some View {
        VStack(spacing: 10) {
            if let note = summary { InlineError(message: note) }
            BusyButton(title: files.count > 1 ? "Upload \(files.count) files" : "Upload", busy: uploading) { upload() }
                .disabled(files.isEmpty || uploading)
                .opacity(files.isEmpty ? 0.5 : 1)
            Button("Cancel") { dismiss() }
                .buttonStyle(SecondaryButtonStyle())
                .disabled(uploading)
        }
        .padding(.top, 4)
    }

    /// "Please select at least one file" is what the web asks for; here the button simply stays off until one is chosen.
    private var summary: String? {
        let count = problems.count
        guard count > 0 else { return nil }
        return count == 1 ? "1 file couldn't be uploaded." : "\(count) files couldn't be uploaded."
    }

    // MARK: Actions

    private func add(_ accessible: [URL], picked: [URL]) {
        held += accessible
        for url in picked where !files.contains(where: { $0.lastPathComponent == url.lastPathComponent }) {
            files.append(url)
        }
    }

    private func remove(_ url: URL) {
        files.removeAll { $0 == url }
        problems[url.lastPathComponent] = nil
        if held.contains(url) {
            url.stopAccessingSecurityScopedResource()
            held.removeAll { $0 == url }
        }
    }

    private func upload() {
        guard !uploading, !files.isEmpty else { return }
        uploading = true
        problems = [:]
        let queued = files
        uploadTask = Task {
            let failed = await model.upload(files: queued, bankName: bankName, shared: shared, accountLabel: accountLabel)
            problems = failed
            // Files that went are done with; the ones that failed stay for another try.
            for url in queued where failed[url.lastPathComponent] == nil { remove(url) }
            uploading = false
            if failed.isEmpty { dismiss() }
        }
    }
}
