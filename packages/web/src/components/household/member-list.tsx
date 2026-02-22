import { useState } from "react";
import { Trash2 } from "lucide-react";
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
import { useRemoveMember } from "@/hooks/use-household";

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
  const [removeTarget, setRemoveTarget] = useState<HouseholdMember | null>(
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

  return (
    <>
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
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setRemoveTarget(member)}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Remove</span>
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
    </>
  );
}
