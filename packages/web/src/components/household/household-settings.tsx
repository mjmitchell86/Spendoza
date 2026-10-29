import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionError } from "@/components/plan-error";
import { useDeleteHousehold, useRenameHousehold } from "@/hooks/use-household";

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

interface HouseholdSettingsProps {
  name: string;
}

/** Rename and delete. Head only: the caller renders this only for the head. */
export function HouseholdSettings({ name }: HouseholdSettingsProps) {
  const rename = useRenameHousehold();
  const remove = useDeleteHousehold();
  const [newName, setNewName] = useState(name);
  const [renameError, setRenameError] = useState<unknown>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleRename(e: FormEvent) {
    e.preventDefault();
    setRenameError(null);
    try {
      await rename.mutateAsync({ name: newName.trim() });
    } catch (err) {
      setRenameError(err);
    }
  }

  async function handleDelete() {
    setDeleteError(null);
    try {
      await remove.mutateAsync({ confirm_name: confirmName });
      setDeleteOpen(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete household");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={(e) => void handleRename(e)} className="flex flex-col gap-2">
        <Label htmlFor="household_name">Household name</Label>
        <ActionError error={renameError} fallback="Failed to rename household" />
        <div className="flex gap-2">
          <Input
            id="household_name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={100}
            required
          />
          <Button
            type="submit"
            variant="outline"
            disabled={rename.isPending || !newName.trim() || newName.trim() === name}
          >
            Rename household
          </Button>
        </div>
      </form>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Deleting removes the household and its shared reports, goals and debts. Everyone&apos;s
          personal data stays.
        </p>
        <Button
          variant="destructive"
          onClick={() => {
            setConfirmName("");
            setDeleteError(null);
            setDeleteOpen(true);
          }}
        >
          Delete household
        </Button>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete household</DialogTitle>
            <DialogDescription>
              This permanently deletes {name} and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm_name">Type the household name to confirm</Label>
            <Input
              id="confirm_name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
            />
          </div>
          {deleteError && <ErrorBanner message={deleteError} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={confirmName !== name || remove.isPending}
            >
              {remove.isPending ? "Deleting..." : "Delete household"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
