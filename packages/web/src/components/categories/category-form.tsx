import { useState, type FormEvent } from "react";
import type { Category, BudgetClass } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateCategory, useUpdateCategory } from "@/hooks/use-categories";

interface CategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category | null;
  hasHousehold: boolean;
}

export function CategoryForm({
  open,
  onOpenChange,
  category,
  hasHousehold,
}: CategoryFormProps) {
  const isEditing = !!category;
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();

  const [name, setName] = useState(category?.name ?? "");
  const [isShared, setIsShared] = useState(
    category?.is_shared_with_household ?? false
  );
  const [budgetClass, setBudgetClass] = useState<BudgetClass>(
    category?.budget_class ?? "want"
  );
  const [error, setError] = useState<string | null>(null);

  const isPending = createCategory.isPending || updateCategory.isPending;

  function resetForm() {
    setName("");
    setIsShared(false);
    setBudgetClass(category?.budget_class ?? "want");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const data = {
      name: name.trim(),
      is_shared_with_household: isShared,
      budget_class: budgetClass,
    };

    try {
      if (isEditing && category) {
        await updateCategory.mutateAsync({ id: category.id, data });
      } else {
        await createCategory.mutateAsync(data);
      }
      resetForm();
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save category"
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Category" : "Create Category"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="category_name">Name</Label>
            <Input
              id="category_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Childcare, Pet Expenses"
              required
            />
          </div>

          {hasHousehold && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="is_shared">Share with Household</Label>
                <p className="text-xs text-muted-foreground">
                  Make this category visible to all household members
                </p>
              </div>
              <Switch
                id="is_shared"
                checked={isShared}
                onCheckedChange={setIsShared}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Budget Class</Label>
            <Select value={budgetClass} onValueChange={(v) => setBudgetClass(v as BudgetClass)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="need">Need (50%)</SelectItem>
                <SelectItem value="want">Want (30%)</SelectItem>
                <SelectItem value="savings">Savings (20%)</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used for 50/30/20 budget allocation tracking
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Saving..."
                : isEditing
                  ? "Update"
                  : "Create Category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
