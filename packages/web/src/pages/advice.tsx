import { useState } from "react";
import { MessageCircle, Send, RefreshCw, Sparkles, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { useProfile } from "@/hooks/use-profile";
import { useAdviceUsage, useAdviceHistory, useAskAdvice, useFollowUpAdvice } from "@/hooks/use-advice";
import { MAX_THREAD_MESSAGES } from "@spendoza/shared";

export function AdvicePage() {
  const { data: profile } = useProfile();
  const { data: usage, isLoading: usageLoading } = useAdviceUsage();
  const { data: history, isLoading: historyLoading } = useAdviceHistory();
  const askAdvice = useAskAdvice();
  const followUpAdvice = useFollowUpAdvice();
  const [question, setQuestion] = useState("");
  const [followUpText, setFollowUpText] = useState<Record<string, string>>({});

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

  type Thread = { threadId: string; messages: NonNullable<typeof history> };

  function groupByThread(items: NonNullable<typeof history>): Thread[] {
    const map = new Map<string, NonNullable<typeof history>>();
    for (const item of items) {
      const tid = item.thread_id;
      if (!map.has(tid)) map.set(tid, []);
      map.get(tid)!.push(item);
    }
    const threads = Array.from(map.entries()).map(([threadId, messages]) => ({
      threadId,
      messages: messages.sort((a, b) => a.message_index - b.message_index),
    }));
    threads.sort(
      (a, b) =>
        new Date(b.messages[0].created_at).getTime() -
        new Date(a.messages[0].created_at).getTime()
    );
    return threads;
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
          {groupByThread(history).map((thread) => {
            const threadFollowUp = followUpText[thread.threadId] ?? "";
            const canFollowUp = thread.messages.length < MAX_THREAD_MESSAGES;
            const remaining = MAX_THREAD_MESSAGES - thread.messages.length;

            return (
              <Card key={thread.threadId}>
                <CardContent className="py-4">
                  {thread.messages.map((item, idx) => (
                    <div key={item.id ?? idx}>
                      {idx > 0 && <Separator className="my-3" />}
                      <div className="mb-2 flex items-start gap-2">
                        <MessageCircle className="mt-0.5 size-4 shrink-0 text-primary" />
                        <p className="text-sm font-medium">{item.question}</p>
                      </div>
                      <div className="prose prose-sm ml-6 max-w-none text-sm text-muted-foreground dark:prose-invert">
                        {item.answer.split("\n").map((line, i) => (
                          <p key={i} className={line.trim() === "" ? "h-2" : ""}>
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Thread metadata + follow-up */}
                  <div className="mt-4 flex items-center gap-2">
                    <Badge variant={canFollowUp ? "secondary" : "outline"} className="text-xs">
                      {remaining}/{MAX_THREAD_MESSAGES} follow-ups remaining
                    </Badge>
                    <span className="text-xs text-muted-foreground/60">
                      {new Date(thread.messages[0].created_at).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
                      )}
                    </span>
                  </div>

                  {canFollowUp && (
                    <form
                      className="mt-3 flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const trimmed = threadFollowUp.trim();
                        if (!trimmed || followUpAdvice.isPending) return;
                        followUpAdvice.mutate(
                          { threadId: thread.threadId, question: trimmed },
                          {
                            onSuccess: () =>
                              setFollowUpText((prev) => ({ ...prev, [thread.threadId]: "" })),
                          }
                        );
                      }}
                    >
                      <Textarea
                        placeholder="Ask a follow-up..."
                        value={threadFollowUp}
                        onChange={(e) =>
                          setFollowUpText((prev) => ({
                            ...prev,
                            [thread.threadId]: e.target.value,
                          }))
                        }
                        disabled={followUpAdvice.isPending}
                        className="min-h-[40px] resize-none"
                        maxLength={500}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={
                          threadFollowUp.trim().length < 5 || followUpAdvice.isPending
                        }
                      >
                        {followUpAdvice.isPending ? (
                          <RefreshCw className="size-4 animate-spin" />
                        ) : (
                          <Send className="size-4" />
                        )}
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
