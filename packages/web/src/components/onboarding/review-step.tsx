import { RefreshCw } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import type { Transaction } from "@spendoza/shared";

interface ReviewStepProps {
  statementIds: string[];
  onNext: () => void;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function ReviewStep({ statementIds, onNext }: ReviewStepProps) {
  const queries = useQueries({
    queries: statementIds.map((id) => ({
      queryKey: ["transactions", id],
      queryFn: async (): Promise<Transaction[]> => {
        const res = await apiClient(`/bank-statements/${id}`);
        return res.transactions;
      },
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const transactions = queries.flatMap((q) => q.data ?? []);

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold tracking-tight">
          Review Transactions
        </h2>
        <p className="text-sm text-muted-foreground">
          Here are the transactions we extracted from your{" "}
          {statementIds.length === 1 ? "statement" : "statements"}. You can
          review and adjust them later.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : !transactions || transactions.length === 0 ? (
        <div className="rounded-lg border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No transactions found. You can add them manually later.
          </p>
        </div>
      ) : (
        <div className="max-h-[400px] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b bg-card">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">
                  Date
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground">
                  Description
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground">
                  Category
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-muted/50">
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                    {tx.date
                      ? new Date(tx.date + "T00:00:00").toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" }
                        )
                      : "-"}
                  </td>
                  <td className="max-w-[120px] truncate px-4 py-2.5 sm:max-w-[200px]">
                    {tx.description}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {tx.ai_category ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium">
                    {formatCurrency(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {transactions.length} transaction
          {transactions.length !== 1 ? "s" : ""} found
          {statementIds.length > 1 &&
            ` across ${statementIds.length} statements`}
        </p>
        <Button onClick={onNext}>Continue</Button>
      </div>
    </div>
  );
}
