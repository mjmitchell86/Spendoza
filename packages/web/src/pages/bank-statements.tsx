import { useState } from "react";
import { Upload, RefreshCw, CheckCircle2, Circle } from "lucide-react";
import type { BankStatement } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useBankStatements } from "@/hooks/use-bank-statements";
import { useCategories } from "@/hooks/use-categories";
import { useHousehold } from "@/hooks/use-household";
import { UploadForm } from "@/components/bank-statements/upload-form";
import { StatementList } from "@/components/bank-statements/statement-list";
import { TransactionReview } from "@/components/bank-statements/transaction-review";

export function BankStatementsPage() {
  const { data: statements, isLoading, error, refetch } = useBankStatements();
  const { data: categories } = useCategories();
  const { data: household } = useHousehold();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Derive selected statement from the latest polled data so status updates
  // are reflected without requiring a manual refresh.
  const selectedStatement =
    statements?.find((s) => s.id === selectedId) ?? null;

  function handleSelectStatement(statement: BankStatement) {
    setSelectedId(selectedId === statement.id ? null : statement.id);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Bank Statements
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload and review your bank statements
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="size-4" />
          Upload Statement
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Statements</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12">
              <p className="text-sm text-destructive">
                {error instanceof Error
                  ? error.message
                  : "Failed to load statements"}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
              >
                Retry
              </Button>
            </div>
          ) : (
            <StatementList
              statements={statements ?? []}
              onSelect={handleSelectStatement}
              selectedId={selectedId}
            />
          )}
        </CardContent>
      </Card>

      {selectedStatement && selectedStatement.status === "parsed" && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle>
              Transactions &mdash;{" "}
              {selectedStatement.bank_name ?? "Unknown Bank"} (
              {new Date(
                selectedStatement.statement_month + "T00:00:00"
              ).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
              })}
              )
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TransactionReview
              statementId={selectedStatement.id}
              isSharedAccount={selectedStatement.is_shared_account}
              categories={categories ?? []}
              householdMembers={household?.members}
            />
          </CardContent>
        </Card>
      )}

      {selectedStatement && selectedStatement.status !== "parsed" && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center text-center">
              {selectedStatement.status === "processing" ? (
                <ProcessingStatus parsedData={selectedStatement.parsed_data} />
              ) : selectedStatement.status === "failed" ? (
                <FailedStatus parsedData={selectedStatement.parsed_data} />
              ) : (
                <p className="text-muted-foreground">
                  This statement has been uploaded and is waiting to be
                  processed.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <UploadForm open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline step progress
// ---------------------------------------------------------------------------

const PIPELINE_STEPS = [
  { key: "extract_text", label: "Reading PDF" },
  { key: "extract_transactions", label: "Extracting transactions" },
  { key: "classify_transactions", label: "Classifying expenses" },
  { key: "match_and_insert", label: "Matching & saving" },
] as const;

function PipelineSteps({ currentStep }: { currentStep: string | undefined }) {
  const currentIdx = PIPELINE_STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="mt-4 flex items-center justify-center gap-2">
      {PIPELINE_STEPS.map((step, idx) => {
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;

        return (
          <div key={step.key} className="flex items-center gap-2">
            {idx > 0 && (
              <div
                className={cn(
                  "h-px w-6",
                  isDone ? "bg-primary" : "bg-muted-foreground/30"
                )}
              />
            )}
            <div className="flex items-center gap-1.5">
              {isDone ? (
                <CheckCircle2 className="size-4 text-primary" />
              ) : isCurrent ? (
                <RefreshCw className="size-4 animate-spin text-primary" />
              ) : (
                <Circle className="size-4 text-muted-foreground/30" />
              )}
              <span
                className={cn(
                  "text-xs",
                  isDone && "text-primary",
                  isCurrent && "font-medium text-foreground",
                  !isDone && !isCurrent && "text-muted-foreground/50"
                )}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProcessingStatus({ parsedData }: { parsedData: unknown }) {
  const step = (parsedData as any)?.pipeline_step as string | undefined;

  return (
    <>
      <RefreshCw className="mb-2 size-6 animate-spin text-muted-foreground" />
      <p className="text-muted-foreground">
        This statement is being processed.
      </p>
      <PipelineSteps currentStep={step} />
    </>
  );
}

function FailedStatus({ parsedData }: { parsedData: unknown }) {
  const failedStep = (parsedData as any)?.failed_step as string | undefined;
  const errorMsg = (parsedData as any)?.error as string | undefined;
  const stepLabel = PIPELINE_STEPS.find((s) => s.key === failedStep)?.label;

  return (
    <>
      <p className="text-destructive">
        Failed to process this statement.
        {stepLabel && (
          <span className="block text-sm mt-1">
            Failed during: {stepLabel}
          </span>
        )}
      </p>
      {errorMsg && (
        <p className="mt-2 text-xs text-muted-foreground max-w-md">
          {errorMsg}
        </p>
      )}
    </>
  );
}
