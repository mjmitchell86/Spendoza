import { useState } from "react";
import { Upload, RefreshCw } from "lucide-react";
import type { BankStatement } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [selectedStatement, setSelectedStatement] =
    useState<BankStatement | null>(null);

  function handleSelectStatement(statement: BankStatement) {
    setSelectedStatement(
      selectedStatement?.id === statement.id ? null : statement
    );
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
              selectedId={selectedStatement?.id ?? null}
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
                <>
                  <RefreshCw className="mb-2 size-6 animate-spin text-muted-foreground" />
                  <p className="text-muted-foreground">
                    This statement is being processed. Check back shortly.
                  </p>
                </>
              ) : selectedStatement.status === "failed" ? (
                <p className="text-destructive">
                  Failed to process this statement. Please try uploading again.
                </p>
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
