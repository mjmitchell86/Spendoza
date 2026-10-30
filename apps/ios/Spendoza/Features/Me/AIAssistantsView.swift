import SpendozaKit
import SwiftUI

/// Connect Spendoza to AI assistants over MCP: the URL, setup steps per client, example questions, the tool groups,
/// and Disconnect AI assistants.
struct AIAssistantsView: View {
    static let mcpURL = "https://mcp.spendoza.io/mcp"
    static let desktopConfig = """
        {
          "mcpServers": {
            "spendoza": {
              "url": "https://mcp.spendoza.io/mcp"
            }
          }
        }
        """
    static let codeCommand = "claude mcp add spendoza --transport http https://mcp.spendoza.io/mcp"

    enum Client: String, CaseIterable, Identifiable {
        case claudeDesktop = "Claude Desktop", claudeCode = "Claude Code", openAIOther = "OpenAI / Other"
        var id: Self { self }
    }

    private static let questions: [(title: String, items: [String])] = [
        ("Understand your finances", [
            "How much did I spend last month and what were my top categories?",
            "Show me my income vs expenses for the last 3 months",
            "What does my savings rate look like?",
            "Give me a summary of my latest financial report",
            "List all my bank statement transactions from March",
        ]),
        ("Ask for advice", [
            "Based on my spending, where can I cut back the most?",
            "Am I on track to meet my savings goals?",
            "What payoff strategy should I use for my debts - avalanche or snowball?",
            "How long until I pay off my credit card at this rate?",
            "Suggest some financial goals based on my spending patterns",
        ]),
        ("Take action", [
            "Add a new monthly income of $5,000 from my salary starting today",
            "Create an expense for my $150/month gym membership",
            "Set a budget goal of $400/month for dining out",
            "Add my student loan: $25,000 at 5.5% interest, $280 minimum payment",
            "Delete the freelance income entry - I stopped that project",
        ]),
    ]

    private static let tools: [(plan: String, text: String)] = [
        ("All plans", "Dashboard, income, expenses, categories, transactions, bank statements, reports, profile"),
        ("Starter and Pro", "Financial goals, goal progress & suggestions, debts, debt payoff projections"),
        ("Pro", "Household dashboard, household-scoped goals & debts"),
    ]

    @State private var model: AIAssistantsModel
    @State private var client: Client = .claudeDesktop
    @Environment(\.dynamicTypeSize) private var typeSize

    init(api: any SpendozaAPI) {
        _model = State(initialValue: AIAssistantsModel(api: api))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                intro
                setup
                examples
                toolGroups
                disconnect
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Theme.paper.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
    }

    private func heading(_ text: String) -> some View {
        Text(text)
            .font(.serif(20, relativeTo: .title3))
            .foregroundStyle(Theme.ink)
            .accessibilityAddTraits(.isHeader)
    }

    private func body(_ text: String) -> some View {
        Text(text)
            .font(.sans(16, relativeTo: .body))
            .foregroundStyle(Theme.soft)
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Connect to AI assistants")
                .font(.serif(28, relativeTo: .largeTitle))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            body("Use the Model Context Protocol (MCP) to connect Spendoza to AI assistants like Claude and ChatGPT. Ask questions about your finances, manage expenses, and track goals through natural conversation.")
            codeBlock(Self.mcpURL, copyLabel: "Copy server URL")
        }
    }

    /// Monospaced, selectable text with Copy beneath it.
    private func codeBlock(_ text: String, copyLabel: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(text)
                .font(.system(.footnote, design: .monospaced))
                .foregroundStyle(Theme.ink)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
            CopyButton(text: text, label: copyLabel)
                .padding(.horizontal, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.bottom, 4)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
        .hairlineBorder(Theme.engraving)
    }

    private var setup: some View {
        VStack(alignment: .leading, spacing: 14) {
            heading("Set up your client")
            clientPicker
            switch client {
            case .claudeDesktop:
                step(1, "Open Claude Desktop settings", detail: "Settings → Developer → Edit Config")
                step(2, "Add Spendoza to your config")
                codeBlock(Self.desktopConfig, copyLabel: "Copy config")
                step(3, "Restart Claude Desktop")
                body("On first use, Claude will open your browser so you can log in with your Spendoza credentials. No passwords are stored in the config.")
            case .claudeCode:
                step(1, "Run this command in your terminal")
                codeBlock(Self.codeCommand, copyLabel: "Copy command")
                body("Claude Code will prompt you to authenticate in your browser the first time you use a Spendoza tool.")
            case .openAIOther:
                step(1, "Add this MCP server URL to your client")
                codeBlock(Self.mcpURL, copyLabel: "Copy server URL")
                body("Any MCP-compatible client can connect using this URL. The server uses OAuth 2.1 for authentication — your client will open a browser window to log in.")
            }
        }
    }

    /// A theme-tinted segmented control: one row of three, stacked at accessibility text sizes so no label truncates.
    private var clientPicker: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 8)) : AnyLayout(HStackLayout(spacing: 8))
        return layout {
            ForEach(Client.allCases) { option in
                let selected = option == client
                Button { client = option } label: {
                    Text(option.rawValue)
                        .font(.sans(14, weight: .semibold, relativeTo: .callout))
                        .foregroundStyle(selected ? Theme.onNote : Theme.note)
                        .multilineTextAlignment(.center)
                        .minimumScaleFactor(0.8)
                        .padding(.horizontal, 4)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(selected ? Theme.note : .clear, in: RoundedRectangle(cornerRadius: Theme.corner))
                        .hairlineBorder(Theme.note)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
    }

    private func step(_ number: Int, _ title: String, detail: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(number). \(title)")
                .font(.sans(16, weight: .semibold, relativeTo: .body))
                .foregroundStyle(Theme.ink)
            if let detail {
                Text(detail)
                    .font(.sans(14, relativeTo: .subheadline))
                    .foregroundStyle(Theme.soft)
            }
        }
    }

    private var examples: some View {
        VStack(alignment: .leading, spacing: 18) {
            heading("What you can do")
            ForEach(Self.questions, id: \.title) { group in
                VStack(alignment: .leading, spacing: 6) {
                    Text(group.title)
                        .font(.sans(16, weight: .semibold, relativeTo: .body))
                        .foregroundStyle(Theme.ink)
                    VStack(spacing: 0) {
                        ForEach(group.items, id: \.self) { question in
                            RuledRow {
                                Text("“\(question)”")
                                    .font(.sans(14, relativeTo: .subheadline))
                                    .foregroundStyle(Theme.soft)
                            }
                        }
                    }
                    .topRule()
                }
            }
        }
    }

    private var toolGroups: some View {
        VStack(alignment: .leading, spacing: 10) {
            heading("Available tools")
            VStack(spacing: 0) {
                ForEach(Self.tools, id: \.plan) { tool in
                    RuledRow {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(tool.plan)
                                .font(.sans(16, weight: .semibold, relativeTo: .body))
                                .foregroundStyle(Theme.ink)
                            Text(tool.text)
                                .font(.sans(14, relativeTo: .subheadline))
                                .foregroundStyle(Theme.soft)
                        }
                    }
                }
            }
            .topRule()
        }
    }

    private var disconnect: some View {
        VStack(alignment: .leading, spacing: 12) {
            heading("Disconnect AI assistants")
            body("Signs out every other session, including connected AI assistants and other devices. You stay signed in here.")
            Button(model.state == .disconnecting ? "Disconnecting…" : "Disconnect AI assistants") {
                Task { await model.disconnect() }
            }
            .buttonStyle(OutlinedDestructiveButtonStyle())
            .disabled(model.state == .disconnecting)
            switch model.state {
            case .done:
                Text(AIAssistantsModel.doneMessage)
                    .font(.sans(14, relativeTo: .subheadline))
                    .foregroundStyle(Theme.note)
            case .failed(let message):
                Text(message)
                    .font(.sans(14, relativeTo: .subheadline))
                    .foregroundStyle(Theme.oxblood)
                    .accessibilityLabel("Error: \(message)")
            case .idle, .disconnecting:
                EmptyView()
            }
        }
    }
}

/// An oxblood-outlined button for a destructive action that isn't final.
private struct OutlinedDestructiveButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.sans(15, weight: .semibold, relativeTo: .callout))
            .foregroundStyle(Theme.oxblood)
            .frame(maxWidth: .infinity, minHeight: 44)
            .hairlineBorder(Theme.oxblood)
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}
