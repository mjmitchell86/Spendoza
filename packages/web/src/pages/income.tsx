import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import type { IncomeEntry } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIncome } from "@/hooks/use-income";
import { useHousehold } from "@/hooks/use-household";
import { IncomeForm } from "@/components/income/income-form";
import { IncomeList } from "@/components/income/income-list";

export function IncomePage() {
  const { data: entries, isLoading, error, refetch } = useIncome();
  const { data: household } = useHousehold();
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<IncomeEntry | null>(null);

  function handleEdit(entry: IncomeEntry) {
    setEditingEntry(entry);
    setFormOpen(true);
  }

  function handleFormClose(open: boolean) {
    setFormOpen(open);
    if (!open) setEditingEntry(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Income</h1>
          <p className="text-sm text-muted-foreground">
            Manage your income sources
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="size-4" />
          Add Income
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Income Sources</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12">
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : "Failed to load income"}
              </p>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <IncomeList
              entries={entries ?? []}
              householdMembers={household?.members}
              onEdit={handleEdit}
            />
          )}
        </CardContent>
      </Card>

      <IncomeForm
        open={formOpen}
        onOpenChange={handleFormClose}
        income={editingEntry}
        householdMembers={household?.members}
      />
    </div>
  );
}
