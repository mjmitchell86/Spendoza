import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useHouseholdInvitations, useRevokeInvitation } from "@/hooks/use-household";

export function PendingInvitations() {
  const { data: invitations } = useHouseholdInvitations();
  const revoke = useRevokeInvitation();
  const [error, setError] = useState<string | null>(null);

  if (!invitations || invitations.length === 0) return null;

  async function handleRevoke(id: string) {
    setError(null);
    try {
      await revoke.mutateAsync(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke invitation");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Pending invitations</Label>
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <ul className="flex flex-col divide-y rounded-md border">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{invitation.email}</p>
              <p className="text-xs text-muted-foreground">
                {`Sent ${new Date(invitation.created_at).toLocaleDateString()} · Expires ${new Date(
                  invitation.expires_at,
                ).toLocaleDateString()}`}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={revoke.isPending}
              onClick={() => void handleRevoke(invitation.id)}
            >
              Revoke
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
