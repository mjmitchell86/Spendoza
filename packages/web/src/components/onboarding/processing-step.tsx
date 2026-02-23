import { useEffect } from "react";
import { RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBankStatement } from "@/hooks/use-bank-statements";

interface ProcessingStepProps {
  statementId: string;
  onComplete: () => void;
  onError: () => void;
}

const STATUS_MESSAGES = [
  "Reading your bank statement...",
  "Extracting transactions...",
  "Categorizing expenses...",
  "Preparing your data...",
];

export function ProcessingStep({
  statementId,
  onComplete,
  onError,
}: ProcessingStepProps) {
  const { data: statement } = useBankStatement(statementId);

  // useBankStatement polls automatically via refetchInterval while processing.
  // React to terminal status changes here.
  useEffect(() => {
    if (!statement) return;

    if (statement.status === "parsed") {
      const timer = setTimeout(onComplete, 1200);
      return () => clearTimeout(timer);
    }
  }, [statement, onComplete]);

  const isParsed = statement?.status === "parsed";
  const isFailed = statement?.status === "failed";

  // Cycle through messages while processing
  const messageIndex =
    Math.floor(Date.now() / 3000) % STATUS_MESSAGES.length;

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      {isParsed ? (
        <>
          <CheckCircle2 className="size-16 text-green-500" />
          <div>
            <h2 className="text-xl font-semibold">All Done!</h2>
            <p className="text-sm text-muted-foreground">
              Your transactions have been extracted successfully.
            </p>
          </div>
        </>
      ) : isFailed ? (
        <>
          <XCircle className="size-16 text-red-500" />
          <div>
            <h2 className="text-xl font-semibold">Processing Failed</h2>
            <p className="text-sm text-muted-foreground">
              We couldn't process your bank statement. You can try again later.
            </p>
          </div>
          <Button variant="outline" onClick={onError}>
            Continue Anyway
          </Button>
        </>
      ) : (
        <>
          <RefreshCw className="size-16 animate-spin text-primary" />
          <div>
            <h2 className="text-xl font-semibold">Processing Your Statement</h2>
            <p className="text-sm text-muted-foreground">
              {STATUS_MESSAGES[messageIndex]}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            This usually takes a minute or two.
          </p>
        </>
      )}
    </div>
  );
}
