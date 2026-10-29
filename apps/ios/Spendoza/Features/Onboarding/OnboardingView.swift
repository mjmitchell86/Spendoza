import SpendozaKit
import SwiftUI
import UniformTypeIdentifiers

/// The first-run flow (welcome, upload, processing, review, complete), also used from Health's empty state
/// (`.addStatement`, which starts at upload and ends with "Done").
struct OnboardingView: View {
    enum Mode { case firstRun, addStatement }

    @State private var model: OnboardingModel
    let mode: Mode
    /// First run: called after onboarding is marked complete, to refresh the session. Add statement: close the cover.
    let onFinish: () -> Void
    var signOut: (() -> Void)?

    init(api: any SpendozaAPI, mode: Mode = .firstRun, signOut: (() -> Void)? = nil, onFinish: @escaping () -> Void) {
        _model = State(initialValue: OnboardingModel(api: api))
        self.mode = mode
        self.signOut = signOut
        self.onFinish = onFinish
    }

    private static let stepLabels = ["Welcome", "Upload", "Processing", "Review", "Complete"]

    /// "Add a statement" is a cover over Health: it can be closed from any step (the upload carries on on the
    /// server). The first run has no Close; it ends with "Go to Health".
    static func showsClose(mode: Mode, step: OnboardingModel.Step) -> Bool {
        mode == .addStatement
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            ScrollView {
                stepContent
                    .padding(.horizontal, 20)
                    .padding(.vertical, 20)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Theme.paper.ignoresSafeArea())
        .onAppear { if mode == .addStatement, model.step == .welcome { model.begin() } }
        .onDisappear { model.cancel() }
    }

    // MARK: Header

    var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                if model.step == .upload, mode == .firstRun {
                    Button { model.back() } label: {
                        Label("Back", systemImage: "chevron.left").font(.sans(15, relativeTo: .body))
                    }
                    .foregroundStyle(Theme.note)
                } else if Self.showsClose(mode: mode, step: model.step) {
                    Button("Close", action: onFinish)
                        .font(.sans(15, relativeTo: .body))
                        .foregroundStyle(Theme.note)
                        .frame(minHeight: 44)
                }
                Spacer()
                Text("Step \(model.step.rawValue + 1) of \(OnboardingModel.Step.allCases.count)")
                    .font(.sans(13, relativeTo: .footnote))
                    .foregroundStyle(Theme.soft)
            }
            .frame(minHeight: 28)
            ProgressView(value: Double(model.step.rawValue + 1), total: Double(OnboardingModel.Step.allCases.count))
                .tint(Theme.note)
                .accessibilityLabel("\(Self.stepLabels[model.step.rawValue]), step \(model.step.rawValue + 1) of 5")
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
    }

    @ViewBuilder var stepContent: some View {
        switch model.step {
        case .welcome: WelcomeStep(begin: model.begin, signOut: signOut)
        case .upload: UploadStep(model: model, canSkip: mode == .firstRun)
        case .processing: ProcessingStep(model: model)
        case .review: ReviewStep(model: model)
        case .complete: CompleteStep(model: model, mode: mode, onFinish: onFinish)
        }
    }
}

// MARK: Shared

struct StepTitle: View {
    let title: String
    var subtitle: String?

    var body: some View {
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
    }
}

// MARK: Welcome

private struct WelcomeStep: View {
    let begin: () -> Void
    let signOut: (() -> Void)?

    private let features: [(String, String, String)] = [
        ("wallet.bifold", "Track finances", "Manage income, expenses, and bank statements in one place"),
        ("chart.bar", "Visual insights", "See where your money goes with a monthly check-up and score"),
        ("person.2", "Household sharing", "Share and manage finances with your family"),
        ("sparkles", "AI-powered", "Automatic bank statement parsing and personalized insights"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            StepTitle(title: "Welcome to Spendoza",
                      subtitle: "Your personal finance tracker. Let's get you set up in just a few steps.")
            VStack(spacing: 0) {
                ForEach(features, id: \.1) { icon, title, detail in
                    RuledRow {
                        HStack(alignment: .top, spacing: 14) {
                            Image(systemName: icon)
                                .font(.system(size: 18))
                                .foregroundStyle(Theme.note)
                                .frame(width: 28)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(title).font(.sans(15, weight: .semibold, relativeTo: .body)).foregroundStyle(Theme.ink)
                                Text(detail).font(.sans(13, relativeTo: .footnote)).foregroundStyle(Theme.soft)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .topRule()
            Button("Get started", action: begin).buttonStyle(PrimaryButtonStyle())
            if let signOut {
                Button("Sign out", action: signOut)
                    .font(.sans(14, relativeTo: .footnote))
                    .foregroundStyle(Theme.soft)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
        }
    }
}

// MARK: Upload

struct UploadStep: View {
    let model: OnboardingModel
    let canSkip: Bool
    @State private var picking = false
    @State private var bankName = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            StepTitle(title: "Upload bank statements",
                      subtitle: "Upload PDF or CSV bank statements and we'll automatically extract your transactions.")
            if let error = model.uploadError { InlineError(message: error) }

            AuthField(label: "Bank name (optional)", text: $bankName, capitalization: .words)
                .disabled(model.isUploading)

            Button { picking = true } label: {
                VStack(spacing: 8) {
                    Image(systemName: model.isUploading ? "arrow.up.circle" : "square.and.arrow.up")
                        .font(.system(size: 30))
                        .foregroundStyle(Theme.note)
                        .accessibilityHidden(true)
                    Text(model.isUploading ? "Uploading..." : "Choose PDFs or CSVs")
                        .font(.sans(15, weight: .semibold, relativeTo: .body))
                        .foregroundStyle(Theme.ink)
                    Text("Max \(APIClient.maxStatementMB) MB per file")
                        .font(.sans(13, relativeTo: .footnote))
                        .foregroundStyle(Theme.soft)
                }
                .frame(maxWidth: .infinity, minHeight: 140)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
                .hairlineBorder(Theme.engraving, dash: [5, 4])
            }
            .disabled(model.isUploading)

            Label("Your bank statement file is deleted once processing finishes (or when you remove a failed upload). We keep the extracted transactions, not the file.",
                  systemImage: "checkmark.shield")
                .font(.sans(13, relativeTo: .footnote))
                .foregroundStyle(Theme.soft)

            if canSkip {
                Button("Skip for now") { model.skipUpload() }
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(model.isUploading)
            }
        }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.pdf, .commaSeparatedText],
                      allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result, !urls.isEmpty else { return }
            // Files from the picker stay readable only while access is held.
            let held = urls.filter { $0.startAccessingSecurityScopedResource() }
            model.startUpload(urls, bankName: bankName) {
                held.forEach { $0.stopAccessingSecurityScopedResource() }
            }
        }
    }
}

// MARK: Processing

struct ProcessingStep: View {
    let model: OnboardingModel

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            if model.isStillWorking, !model.pollTimedOut {
                working
            } else if model.pollTimedOut {
                stillWorking
            } else if model.allParsedAreSplits, model.failedStatements.isEmpty {
                split
            } else {
                finished
            }
            if let error = model.actionError { InlineError(message: error) }
            ForEach(model.failedStatements) { statement in failedRow(statement) }
        }
        .task(id: model.pollToken) { await model.pollUntilProcessed() }
    }

    private var working: some View {
        VStack(alignment: .leading, spacing: 12) {
            ProgressView().tint(Theme.note).controlSize(.large)
            StepTitle(title: model.statements.count == 1 ? "Processing your statement" : "Processing your statements",
                      subtitle: model.progressMessage)
            if model.statements.count > 1 {
                Text("\(model.statements.count - model.statements.filter { $0.status == .processing || $0.status == .uploaded }.count) of \(model.statements.count) complete")
                    .font(.sans(13, relativeTo: .footnote)).foregroundStyle(Theme.soft)
            }
            Text("This usually takes a minute or two\(model.statements.count > 1 ? " per statement" : "").")
                .font(.sans(13, relativeTo: .footnote)).foregroundStyle(Theme.soft)
        }
    }

    private var split: some View {
        VStack(alignment: .leading, spacing: 16) {
            StepTitle(title: "Statements split successfully", subtitle: model.splitMessage)
            Button("Continue") { model.continueToComplete() }.buttonStyle(PrimaryButtonStyle())
        }
    }

    private var stillWorking: some View {
        VStack(alignment: .leading, spacing: 16) {
            StepTitle(title: "Still working", subtitle: OnboardingModel.stillWorkingMessage)
            Button("Continue") { model.continueToComplete() }.buttonStyle(PrimaryButtonStyle())
        }
    }

    @ViewBuilder private var finished: some View {
        if model.parsedCount == 0 {
            VStack(alignment: .leading, spacing: 16) {
                StepTitle(title: "Processing failed", subtitle: "You can try again, or continue and add a statement later.")
                Button("Continue anyway") { model.continueToComplete() }.buttonStyle(SecondaryButtonStyle())
            }
        } else {
            VStack(alignment: .leading, spacing: 16) {
                StepTitle(title: "Processing complete",
                          subtitle: "\(model.parsedCount) of \(model.statements.count) statements processed successfully.")
                Button("Continue") { model.continueToReview() }.buttonStyle(PrimaryButtonStyle())
            }
        }
    }

    private func failedRow(_ statement: Statement) -> some View {
        OutlinedPanel {
            VStack(alignment: .leading, spacing: 12) {
                Text(OnboardingModel.failedMessage)
                HStack(spacing: 12) {
                    Button("Retry") { Task { await model.retry(id: statement.id) } }
                        .buttonStyle(PrimaryButtonStyle())
                    Button("Remove") { Task { await model.remove(id: statement.id) } }
                        .buttonStyle(SecondaryButtonStyle())
                }
            }
        }
    }
}

// MARK: Review

struct ReviewStep: View {
    let model: OnboardingModel

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            StepTitle(title: "Review transactions",
                      subtitle: "Here are the transactions we extracted from your \(model.statements.count == 1 ? "statement" : "statements"). You can review and adjust them later.")
            if model.isLoadingReview {
                ProgressView().tint(Theme.note).frame(maxWidth: .infinity, minHeight: 80)
            } else if model.reviewTransactions.isEmpty {
                OutlinedPanel { Text("No transactions found.").foregroundStyle(Theme.soft) }
            } else {
                VStack(spacing: 0) {
                    ForEach(model.reviewTransactions.prefix(50)) { tx in
                        RuledRow {
                            HStack(alignment: .firstTextBaseline) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(tx.description).font(.sans(15, relativeTo: .body)).foregroundStyle(Theme.ink).lineLimit(1)
                                    Text([Self.shortDate(tx.date), tx.category].compactMap { $0 }.joined(separator: " · "))
                                        .font(.sans(12, relativeTo: .caption)).foregroundStyle(Theme.soft)
                                }
                                Spacer(minLength: 12)
                                Text(tx.amount, format: .currency(code: "USD"))
                                    .font(.serif(15, relativeTo: .body)).foregroundStyle(Theme.ink)
                            }
                        }
                    }
                }
                .topRule()
                Text("\(model.reviewTransactions.count) transaction\(model.reviewTransactions.count == 1 ? "" : "s") found")
                    .font(.sans(13, relativeTo: .footnote)).foregroundStyle(Theme.soft)
            }
            Button("Continue") { model.continueFromReview() }.buttonStyle(PrimaryButtonStyle())
        }
        .task { await model.loadReview() }
    }

    /// "2026-10-02" -> "Oct 2"
    static func shortDate(_ iso: String) -> String? {
        guard let month = Month(apiString: iso), let day = Int(iso.suffix(2)) else { return nil }
        return "\(month.name.prefix(3)) \(day)"
    }
}

// MARK: Complete

struct CompleteStep: View {
    let model: OnboardingModel
    let mode: OnboardingView.Mode
    let onFinish: () -> Void
    @State private var emailReports = true
    @State private var isSubmitting = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            if mode == .firstRun {
                StepTitle(title: "You're all set!",
                          subtitle: "Your account is ready. Head to Health to see your first check-up.")
                RuledRow {
                    Toggle("Email me weekly Spendoza reports", isOn: $emailReports)
                        .font(.sans(15, relativeTo: .body))
                        .foregroundStyle(Theme.ink)
                        .tint(Theme.note)
                }
                .topRule()
                if let error { InlineError(message: error) }
                Button(isSubmitting ? "Setting up..." : "Go to Health") { finish() }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isSubmitting)
                Text("You can always update your settings and upload more statements later.")
                    .font(.sans(13, relativeTo: .footnote)).foregroundStyle(Theme.soft)
            } else {
                let result = model.addStatementResult
                StepTitle(title: result.title, subtitle: result.subtitle)
                Button("Done", action: onFinish).buttonStyle(PrimaryButtonStyle())
            }
        }
    }

    private func finish() {
        isSubmitting = true
        error = nil
        Task {
            do {
                try await model.finish(emailReports: emailReports)
                onFinish()
            } catch {
                self.error = (error as? APIError)?.userMessage ?? "Couldn't finish setting up. Try again."
            }
            isSubmitting = false
        }
    }
}
