import { useEffect } from "react";
import { RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBankStatements } from "@/hooks/use-bank-statements";

interface ProcessingStepProps {
  statementIds: string[];
  onComplete: () => void;
  onError: () => void;
}

const STEP_MESSAGES: Record<string, string> = {
  extract_text: "Reading your bank statement...",
  extract_transactions: "Extracting transactions...",
  classify_transactions: "Categorizing expenses...",
  match_and_insert: "Preparing your data...",
};

export function ProcessingStep({
  statementIds,
  onComplete,
  onError,
}: ProcessingStepProps) {
  // Poll all statements via the list endpoint (already has auto-refetch)
  const { data: allStatements } = useBankStatements();

  const tracked = (allStatements ?? []).filter((s) =>
    statementIds.includes(s.id)
  );

  const parsedCount = tracked.filter((s) => s.status === "parsed").length;
  const failedCount = tracked.filter((s) => s.status === "failed").length;
  const totalCount = statementIds.length;
  const allDone = tracked.length === totalCount && parsedCount + failedCount === totalCount;
  const allParsed = parsedCount === totalCount;
  const allFailed = failedCount === totalCount;

  // Find the current pipeline step for any still-processing statement
  const processing = tracked.find(
    (s) => s.status === "processing" || s.status === "uploaded"
  );
  const pipelineStep = (processing?.parsed_data as any)?.pipeline_step as
    | string
    | undefined;
  const statusMessage =
    (pipelineStep && STEP_MESSAGES[pipelineStep]) ??
    "Processing your statements...";

  useEffect(() => {
    if (!allDone) return;

    if (allFailed) return; // Don't auto-advance if everything failed

    const timer = setTimeout(onComplete, 1200);
    return () => clearTimeout(timer);
  }, [allDone, allFailed, onComplete]);

  if (allDone && allParsed) {
    return (
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <CheckCircle2 className="size-16 text-green-500" />
        <div>
          <h2 className="text-xl font-semibold">All Done!</h2>
          <p className="text-sm text-muted-foreground">
            {totalCount === 1
              ? "Your transactions have been extracted successfully."
              : `All ${totalCount} statements processed successfully.`}
          </p>
        </div>
      </div>
    );
  }

  if (allDone && allFailed) {
    return (
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <XCircle className="size-16 text-red-500" />
        <div>
          <h2 className="text-xl font-semibold">Processing Failed</h2>
          <p className="text-sm text-muted-foreground">
            We couldn't process your bank{" "}
            {totalCount === 1 ? "statement" : "statements"}. You can try again
            later.
          </p>
        </div>
        <Button variant="outline" onClick={onError}>
          Continue Anyway
        </Button>
      </div>
    );
  }

  if (allDone) {
    // Partial success
    return (
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <CheckCircle2 className="size-16 text-green-500" />
        <div>
          <h2 className="text-xl font-semibold">Processing Complete</h2>
          <p className="text-sm text-muted-foreground">
            {parsedCount} of {totalCount} statements processed successfully.
            {failedCount > 0 && ` ${failedCount} failed — you can retry later.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <RefreshCw className="size-16 animate-spin text-primary" />
      <div>
        <h2 className="text-xl font-semibold">
          Processing Your {totalCount === 1 ? "Statement" : "Statements"}
        </h2>
        <p className="text-sm text-muted-foreground">{statusMessage}</p>
        {totalCount > 1 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {parsedCount + failedCount} of {totalCount} complete
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        This usually takes a minute or two{totalCount > 1 ? " per statement" : ""}.
      </p>
    </div>
  );
}
