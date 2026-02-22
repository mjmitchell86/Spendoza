import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Category, HouseholdMember } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useTransactions,
  useUpdateTransaction,
  useBulkAttributeTransactions,
} from "@/hooks/use-bank-statements";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

interface TransactionReviewProps {
  statementId: string;
  isSharedAccount: boolean;
  categories: Category[];
  householdMembers?: HouseholdMember[];
}

export function TransactionReview({
  statementId,
  isSharedAccount,
  categories,
  householdMembers,
}: TransactionReviewProps) {
  const {
    data: transactions,
    isLoading,
    error,
    refetch,
  } = useTransactions(statementId);
  const updateTransaction = useUpdateTransaction();
  const bulkAttribute = useBulkAttributeTransactions();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignTo, setBulkAssignTo] = useState("");

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (!transactions) return;
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  }

  async function handleCategoryChange(
    transactionId: string,
    category: string
  ) {
    await updateTransaction.mutateAsync({
      transactionId,
      data: { ai_category: category || null },
    });
  }

  async function handleAssignTo(transactionId: string, userId: string) {
    await updateTransaction.mutateAsync({
      transactionId,
      data: { attributed_to_user_id: userId },
    });
  }

  async function handleBulkAssign() {
    if (!bulkAssignTo || selectedIds.size === 0) return;
    await bulkAttribute.mutateAsync({
      attributions: Array.from(selectedIds).map((transaction_id) => ({
        transaction_id,
        attributed_to_user_id: bulkAssignTo,
      })),
    });
    setSelectedIds(new Set());
    setBulkAssignTo("");
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <p className="text-sm text-destructive">
          {error instanceof Error
            ? error.message
            : "Failed to load transactions"}
        </p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">
          No transactions found for this statement.
        </p>
      </div>
    );
  }

  const allSelected = selectedIds.size === transactions.length;

  return (
    <div className="flex flex-col gap-4">
      {isSharedAccount && householdMembers && householdMembers.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} selected
          </span>
          <Select value={bulkAssignTo} onValueChange={setBulkAssignTo}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Assign to..." />
            </SelectTrigger>
            <SelectContent>
              {householdMembers.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={
              !bulkAssignTo ||
              selectedIds.size === 0 ||
              bulkAttribute.isPending
            }
            onClick={() => void handleBulkAssign()}
          >
            {bulkAttribute.isPending ? "Assigning..." : "Bulk Assign"}
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            {isSharedAccount && (
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="size-4 rounded border"
                />
              </TableHead>
            )}
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Category</TableHead>
            {isSharedAccount && <TableHead>Assign To</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((tx) => (
            <TableRow key={tx.id}>
              {isSharedAccount && (
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(tx.id)}
                    onChange={() => toggleSelect(tx.id)}
                    className="size-4 rounded border"
                  />
                </TableCell>
              )}
              <TableCell>{formatDate(tx.date)}</TableCell>
              <TableCell className="max-w-[200px] truncate">
                {tx.description}
              </TableCell>
              <TableCell className="font-mono">
                {formatCurrency(tx.amount)}
              </TableCell>
              <TableCell>
                <Badge
                  variant={tx.type === "credit" ? "secondary" : "outline"}
                >
                  {tx.type}
                </Badge>
              </TableCell>
              <TableCell>
                <Select
                  value={tx.ai_category ?? ""}
                  onValueChange={(v) =>
                    void handleCategoryChange(tx.id, v)
                  }
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Uncategorized" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Uncategorized</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              {isSharedAccount && householdMembers && (
                <TableCell>
                  <Select
                    value={tx.attributed_to_user_id ?? ""}
                    onValueChange={(v) => void handleAssignTo(tx.id, v)}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      {householdMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
