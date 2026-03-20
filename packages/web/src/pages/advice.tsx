import { useState } from "react";
import { MessageCircle, Send, RefreshCw, Sparkles, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { useProfile } from "@/hooks/use-profile";
import { useAdviceUsage, useAdviceHistory, useAskAdvice } from "@/hooks/use-advice";

export function AdvicePage() {
  const { data: profile } = useProfile();
  const { data: usage, isLoading: usageLoading } = useAdviceUsage();
  const { data: history, isLoading: historyLoading } = useAdviceHistory();
  const askAdvice = useAskAdvice();
  const [question, setQuestion] = useState("");

  // Free users get upgrade prompt
  if (profile && profile.subscription_tier === "free") {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Financial Advisor
          </h1>
          <p className="text-sm text-muted-foreground">
            Ask AI-powered questions about your finances
          </p>
        </div>
        <UpgradePrompt feature="Financial Advisor" requiredTier="Starter" />
      </div>
    );
  }

  const canAsk = (usage?.remaining ?? 0) > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || !canAsk || askAdvice.isPending) return;
    askAdvice.mutate(
      { question: trimmed },
      {
        onSuccess: () => setQuestion(""),
      }
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Financial Advisor
          </h1>
          <p className="text-sm text-muted-foreground">
            Ask AI-powered questions about your trends, financial health, and
            get personalized advice
          </p>
        </div>
        {!usageLoading && usage && (
          <Badge
            variant={usage.remaining > 0 ? "secondary" : "destructive"}
            className="shrink-0 self-start sm:self-auto"
          >
            {usage.remaining}/{usage.limit} questions remaining today
          </Badge>
        )}
      </div>

      {/* Ask Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" />
            Ask a Question
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Textarea
              placeholder={
                canAsk
                  ? "e.g. How is my spending trending? Am I saving enough for emergencies? What should I prioritize paying off first?"
                  : "Daily question limit reached. Try again tomorrow!"
              }
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={!canAsk || askAdvice.isPending}
              className="min-h-[80px] resize-none"
              maxLength={500}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {question.length}/500
              </span>
              <Button
                type="submit"
                disabled={
                  !canAsk ||
                  question.trim().length < 5 ||
                  askAdvice.isPending
                }
              >
                {askAdvice.isPending ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : !canAsk ? (
                  <Lock className="size-4" />
                ) : (
                  <Send className="size-4" />
                )}
                {askAdvice.isPending
                  ? "Thinking..."
                  : !canAsk
                    ? "Limit Reached"
                    : "Ask"}
              </Button>
            </div>
            {askAdvice.isError && (
              <p className="text-sm text-destructive">
                {askAdvice.error.message}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Example Prompts */}
      {(!history || history.length === 0) && !historyLoading && (
        <Card className="border-dashed">
          <CardContent className="py-6">
            <p className="mb-3 text-sm font-medium text-muted-foreground">
              Try asking about:
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                "How is my spending trending month over month?",
                "Am I on track with the 50/30/20 budget rule?",
                "What should I prioritize: paying off debt or saving?",
                "How can I improve my financial health score?",
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setQuestion(prompt)}
                  disabled={!canAsk}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      {historyLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : history && history.length > 0 ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Your Questions</h2>
          {history.map((item, idx) => (
            <Card key={item.id ?? idx}>
              <CardContent className="py-4">
                <div className="mb-2 flex items-start gap-2">
                  <MessageCircle className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p className="text-sm font-medium">{item.question}</p>
                </div>
                <Separator className="my-3" />
                <div className="prose prose-sm max-w-none text-sm text-muted-foreground dark:prose-invert">
                  {item.answer.split("\n").map((line, i) => (
                    <p key={i} className={line.trim() === "" ? "h-2" : ""}>
                      {line}
                    </p>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground/60">
                  {new Date(item.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
