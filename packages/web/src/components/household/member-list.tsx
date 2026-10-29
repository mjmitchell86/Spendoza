import { useState } from "react";
import { Trash2, ShieldCheck } from "lucide-react";
import type { HouseholdMember } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
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
import { useRemoveMember, useTransferOwnership } from "@/hooks/use-household";

const SHARING_LABELS: Record<string, string> = {
  all: "All",
  none: "None",
  partial: "Partial",
  category: "By Category",
};

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

interface MemberListProps {
  members: HouseholdMember[];
  headId: string;
  currentUserId: string;
  isHead: boolean;
}

export function MemberList({
  members,
  headId,
  currentUserId,
  isHead,
}: MemberListProps) {
  const removeMember = useRemoveMember();
  const transferOwnership = useTransferOwnership();
  const [removeTarget, setRemoveTarget] = useState<HouseholdMember | null>(
    null
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<HouseholdMember | null>(
    null
  );

  async function handleRemove() {
    if (!removeTarget) return;
    setActionError(null);
    try {
      await removeMember.mutateAsync(removeTarget.id);
      setRemoveTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to remove member");
    }
  }

  async function handleTransfer() {
    if (!transferTarget) return;
    setActionError(null);
    try {
      await transferOwnership.mutateAsync({ new_head_id: transferTarget.id });
      setTransferTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to transfer");
    }
  }

  return (
    <>
      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Income Sharing</TableHead>
            <TableHead>Expense Sharing</TableHead>
            {isHead && <TableHead className="w-16">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell className="font-medium">
                {member.display_name}
                {member.id === headId && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (Head)
                  </span>
                )}
                {member.id === currentUserId && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (You)
                  </span>
                )}
              </TableCell>
              <TableCell>
                {SHARING_LABELS[member.income_sharing_mode] ??
                  member.income_sharing_mode}
              </TableCell>
              <TableCell>
                {SHARING_LABELS[member.expense_sharing_mode] ??
                  member.expense_sharing_mode}
              </TableCell>
              {isHead && (
                <TableCell>
                  {member.id !== currentUserId && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setActionError(null);
                          setTransferTarget(member);
                        }}
                        title="Make head of household"
                      >
                        <ShieldCheck className="size-4" />
                        <span className="sr-only">Make head of household</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setActionError(null);
                          setRemoveTarget(member);
                        }}
                        title="Remove from household"
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">Remove from household</span>
                      </Button>
                    </div>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>

      <Dialog
        open={!!removeTarget}
        onOpenChange={(v) => {
          if (!v) setRemoveTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from household</DialogTitle>
            <DialogDescription>
              Remove {removeTarget?.display_name} from the household? Your invite
              code will change.
            </DialogDescription>
          </DialogHeader>
          {actionError && <ErrorBanner message={actionError} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={removeMember.isPending}
            >
              {removeMember.isPending ? "Removing..." : "Remove from household"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!transferTarget}
        onOpenChange={(v) => {
          if (!v) setTransferTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make head of household</DialogTitle>
            <DialogDescription>
              Make {transferTarget?.display_name} the head of household? You will
              no longer be the head of household.
            </DialogDescription>
          </DialogHeader>
          {actionError && <ErrorBanner message={actionError} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={transferOwnership.isPending}
            >
              {transferOwnership.isPending ? "Transferring..." : "Make head of household"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
