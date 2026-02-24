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
  const [transferTarget, setTransferTarget] = useState<HouseholdMember | null>(
    null
  );

  async function handleRemove() {
    if (!removeTarget) return;
    try {
      await removeMember.mutateAsync(removeTarget.id);
      setRemoveTarget(null);
    } catch {
      // Error handled by mutation
    }
  }

  async function handleTransfer() {
    if (!transferTarget) return;
    try {
      await transferOwnership.mutateAsync({ new_head_id: transferTarget.id });
      setTransferTarget(null);
    } catch {
      // Error handled by mutation
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
                        onClick={() => setTransferTarget(member)}
                        title="Transfer ownership"
                      >
                        <ShieldCheck className="size-4" />
                        <span className="sr-only">Transfer ownership</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setRemoveTarget(member)}
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">Remove</span>
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
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {removeTarget?.display_name} from
              the household? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={removeMember.isPending}
            >
              {removeMember.isPending ? "Removing..." : "Remove"}
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
            <DialogTitle>Transfer Ownership</DialogTitle>
            <DialogDescription>
              Transfer ownership to {transferTarget?.display_name}? You will no
              longer be the head of household.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={transferOwnership.isPending}
            >
              {transferOwnership.isPending ? "Transferring..." : "Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
