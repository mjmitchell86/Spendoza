import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTransactions } from "@/hooks/use-bank-statements";

interface ReviewStepProps {
  statementId: string;
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

export function ReviewStep({ statementId, onNext }: ReviewStepProps) {
  const { data: transactions, isLoading } = useTransactions(statementId);

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold tracking-tight">
          Review Transactions
        </h2>
        <p className="text-sm text-muted-foreground">
          Here are the transactions we extracted from your statement. You can
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
        <div className="max-h-[400px] overflow-y-auto rounded-lg border">
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
                  <td className="max-w-[200px] truncate px-4 py-2.5">
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
          {transactions?.length ?? 0} transaction
          {(transactions?.length ?? 0) !== 1 ? "s" : ""} found
        </p>
        <Button onClick={onNext}>Continue</Button>
      </div>
    </div>
  );
}
