import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { IncomeEntry, HouseholdMember } from "@spendoza/shared";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteIncome } from "@/hooks/use-income";

const FREQUENCY_LABELS: Record<string, string> = {
  one_time: "One-time",
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  annually: "Annually",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface IncomeListProps {
  entries: IncomeEntry[];
  householdMembers?: HouseholdMember[];
  onEdit: (entry: IncomeEntry) => void;
}

export function IncomeList({
  entries,
  householdMembers,
  onEdit,
}: IncomeListProps) {
  const deleteIncome = useDeleteIncome();
  const [deleteTarget, setDeleteTarget] = useState<IncomeEntry | null>(null);

  function getMemberName(userId: string | null) {
    if (!userId || !householdMembers) return null;
    return householdMembers.find((m) => m.id === userId)?.display_name ?? null;
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteIncome.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Error is handled by the mutation
    }
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">No income entries yet.</p>
        <p className="text-sm text-muted-foreground">
          Add your first income source to get started.
        </p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Source</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Frequency</TableHead>
            <TableHead className="hidden sm:table-cell">
              Effective Date
            </TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => {
            const memberName = getMemberName(entry.attributed_to_user_id);
            return (
              <TableRow key={entry.id}>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{entry.source_name}</span>
                    <div className="flex flex-wrap gap-1">
                      {entry.is_ai_suggested && (
                        <Badge variant="secondary" className="text-xs">
                          AI Suggested
                        </Badge>
                      )}
                      {memberName && (
                        <Badge variant="outline" className="text-xs">
                          {memberName}
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-mono">
                  {formatCurrency(entry.amount)}
                </TableCell>
                <TableCell>
                  {FREQUENCY_LABELS[entry.frequency] ?? entry.frequency}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {formatDate(entry.effective_date)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onEdit(entry)}
                    >
                      <Pencil className="size-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteTarget(entry)}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Income Entry</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;
              {deleteTarget?.source_name}&rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteIncome.isPending}
            >
              {deleteIncome.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
