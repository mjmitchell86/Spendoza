import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Cpu,
  Copy,
  Check,
  MessageSquare,
  PenLine,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProfile } from "@/hooks/use-profile";
import { TIER_LIMITS } from "@spendoza/shared";

const MCP_URL = "https://mcp.spendoza.io/mcp";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="absolute right-2 top-2 size-7"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? (
        <Check className="size-3.5 text-green-500" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </Button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <CopyButton text={code} />
      <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const claudeDesktopConfig = JSON.stringify(
  {
    mcpServers: {
      spendoza: {
        url: MCP_URL,
      },
    },
  },
  null,
  2
);

const claudeCodeCommand = `claude mcp add spendoza --transport http ${MCP_URL}`;

const openaiConfig = `# In ChatGPT or any OpenAI-compatible client that supports MCP:
# Add a new MCP server with this URL:
${MCP_URL}`;

const examplePrompts = [
  {
    category: "Understand Your Finances",
    icon: TrendingUp,
    prompts: [
      "How much did I spend last month and what were my top categories?",
      "Show me my income vs expenses for the last 3 months",
      "What does my savings rate look like?",
      "Give me a summary of my latest financial report",
      "List all my bank statement transactions from March",
    ],
  },
  {
    category: "Ask for Advice",
    icon: MessageSquare,
    prompts: [
      "Based on my spending, where can I cut back the most?",
      "Am I on track to meet my savings goals?",
      "What payoff strategy should I use for my debts - avalanche or snowball?",
      "How long until I pay off my credit card at this rate?",
      "Suggest some financial goals based on my spending patterns",
    ],
  },
  {
    category: "Take Action",
    icon: PenLine,
    prompts: [
      "Add a new monthly income of $5,000 from my salary starting today",
      "Create an expense for my $150/month gym membership",
      "Set a budget goal of $400/month for dining out",
      "Add my student loan: $25,000 at 5.5% interest, $280 minimum payment",
      "Delete the freelance income entry - I stopped that project",
    ],
  },
];

const tierToolCounts = { free: 15, starter: 26, pro: 27 };

export function McpPage() {
  const { data: profile } = useProfile();
  const tier = profile?.subscription_tier ?? "free";
  const limits = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
            <Cpu className="size-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Connect to AI Assistants
          </h1>
        </div>
        <p className="text-muted-foreground">
          Use the Model Context Protocol (MCP) to connect Spendoza to AI
          assistants like Claude and ChatGPT. Ask questions about your finances,
          manage expenses, and track goals through natural conversation.
        </p>
      </div>

      {/* Quickstart */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Quickstart</h2>
        <Tabs defaultValue="claude-desktop">
          <TabsList className="w-full">
            <TabsTrigger value="claude-desktop" className="flex-1">
              Claude Desktop
            </TabsTrigger>
            <TabsTrigger value="claude-code" className="flex-1">
              Claude Code
            </TabsTrigger>
            <TabsTrigger value="openai" className="flex-1">
              OpenAI / Other
            </TabsTrigger>
          </TabsList>

          <TabsContent value="claude-desktop" className="flex flex-col gap-3">
            <Card>
              <CardContent className="flex flex-col gap-4 p-6">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">
                    1. Open Claude Desktop settings
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Go to{" "}
                    <span className="font-mono text-xs">
                      Settings &rarr; Developer &rarr; Edit Config
                    </span>
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">
                    2. Add Spendoza to your config
                  </p>
                  <CodeBlock code={claudeDesktopConfig} />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">
                    3. Restart Claude Desktop
                  </p>
                  <p className="text-sm text-muted-foreground">
                    On first use, Claude will open your browser so you can log in
                    with your Spendoza credentials. No passwords are stored in
                    the config.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="claude-code" className="flex flex-col gap-3">
            <Card>
              <CardContent className="flex flex-col gap-4 p-6">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">
                    Run this command in your terminal
                  </p>
                  <CodeBlock code={claudeCodeCommand} />
                </div>
                <p className="text-sm text-muted-foreground">
                  Claude Code will prompt you to authenticate in your browser
                  the first time you use a Spendoza tool.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="openai" className="flex flex-col gap-3">
            <Card>
              <CardContent className="flex flex-col gap-4 p-6">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">
                    Add this MCP server URL to your client
                  </p>
                  <CodeBlock code={openaiConfig} />
                </div>
                <p className="text-sm text-muted-foreground">
                  Any MCP-compatible client can connect using this URL. The
                  server uses OAuth 2.1 for authentication &mdash; your client
                  will open a browser window to log in.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Example Prompts */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">What You Can Do</h2>
        <div className="flex flex-col gap-4">
          {examplePrompts.map((section) => {
            const Icon = section.icon;
            return (
              <Card key={section.category}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="size-4 text-primary" />
                    {section.category}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 pt-0">
                  {section.prompts.map((prompt) => (
                    <div
                      key={prompt}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <ArrowRight className="mt-0.5 size-3 shrink-0 text-primary/50" />
                      <span>&ldquo;{prompt}&rdquo;</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Tier Info */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Available Tools</h2>
        <Card>
          <CardContent className="flex flex-col gap-4 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Your plan:</span>
                <Badge variant="secondary" className="capitalize">
                  {tier}
                </Badge>
              </div>
              <span className="text-sm text-muted-foreground">
                {tierToolCounts[tier as keyof typeof tierToolCounts]} tools
                available
              </span>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  All plans
                </p>
                <p className="text-muted-foreground">
                  Dashboard, income, expenses, categories, transactions, bank
                  statements, reports, profile
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">Starter+</p>
                  {!limits.goals && (
                    <Badge variant="outline" className="text-xs">
                      Upgrade required
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground">
                  Financial goals, goal progress & suggestions, debts, debt
                  payoff projections
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">Pro</p>
                  {!limits.household && (
                    <Badge variant="outline" className="text-xs">
                      Upgrade required
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground">
                  Household dashboard, household-scoped goals & debts
                </p>
              </div>
            </div>

            {tier === "free" && (
              <Button asChild variant="outline" size="sm" className="w-fit">
                <Link to="/pricing">
                  Upgrade for more tools
                  <ArrowRight className="ml-1 size-3.5" />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
