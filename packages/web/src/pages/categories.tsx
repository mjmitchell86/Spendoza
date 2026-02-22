import { useState } from "react";
import { Plus, Pencil, Trash2, RefreshCw, Shield } from "lucide-react";
import type { Category } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCategories,
  useDeleteCategory,
  useUpdateCategory,
} from "@/hooks/use-categories";
import { useHousehold } from "@/hooks/use-household";
import { CategoryForm } from "@/components/categories/category-form";

export function CategoriesPage() {
  const { data: categories, isLoading, error, refetch } = useCategories();
  const { data: household } = useHousehold();
  const deleteCategory = useDeleteCategory();
  const updateCategory = useUpdateCategory();

  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const hasHousehold = !!household?.household;

  function handleEdit(category: Category) {
    setEditingCategory(category);
    setFormOpen(true);
  }

  function handleFormClose(open: boolean) {
    setFormOpen(open);
    if (!open) setEditingCategory(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteCategory.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Error handled by mutation
    }
  }

  async function handleToggleShared(category: Category) {
    await updateCategory.mutateAsync({
      id: category.id,
      data: { is_shared_with_household: !category.is_shared_with_household },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
          <p className="text-sm text-muted-foreground">
            Organize your expenses with categories
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="size-4" />
          New Category
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12">
          <p className="text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Failed to load categories"}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : !categories || categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">No categories yet.</p>
          <p className="text-sm text-muted-foreground">
            Create your first custom category to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <Card key={category.id} className="py-4">
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  {category.name}
                  {category.is_system_default && (
                    <Badge variant="secondary" className="text-xs">
                      <Shield className="mr-1 size-3" />
                      System
                    </Badge>
                  )}
                </CardTitle>
                {!category.is_system_default && (
                  <CardAction>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleEdit(category)}
                      >
                        <Pencil className="size-3" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setDeleteTarget(category)}
                      >
                        <Trash2 className="size-3" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </CardAction>
                )}
              </CardHeader>
              {hasHousehold && (
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`shared-${category.id}`}
                      checked={category.is_shared_with_household}
                      onCheckedChange={() => void handleToggleShared(category)}
                      disabled={updateCategory.isPending}
                    />
                    <Label
                      htmlFor={`shared-${category.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      Shared with household
                    </Label>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      <CategoryForm
        open={formOpen}
        onOpenChange={handleFormClose}
        category={editingCategory}
        hasHousehold={hasHousehold}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}
              &rdquo;? Expenses using this category will remain but become
              uncategorized.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteCategory.isPending}
            >
              {deleteCategory.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
