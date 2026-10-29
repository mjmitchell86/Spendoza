import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useAcceptInvitation,
  useDeclineInvitation,
  useMyInvitations,
  type MyInvitation,
} from "@/hooks/use-household";

function InvitationRow({
  invitation,
  initialCode,
  onAccepted,
}: {
  invitation: MyInvitation;
  initialCode: string;
  onAccepted?: () => void;
}) {
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const busy = accept.isPending || decline.isPending;

  async function run(action: "accept" | "decline") {
    setError(null);
    try {
      await (action === "accept" ? accept : decline).mutateAsync({
        id: invitation.id,
        code: code.trim(),
      });
      if (action === "accept") onAccepted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} invitation`);
    }
  }

  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <p className="text-sm font-medium">
        {invitation.inviter_name} invited you to {invitation.household_name}
      </p>
      <Input
        aria-label="Invitation code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="ABCDE-FGHJK"
        autoComplete="off"
      />
      <p className="text-xs text-muted-foreground">
        Enter the code from your invitation email.
      </p>
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !code.trim()} onClick={() => void run("accept")}>
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !code.trim()}
          onClick={() => void run("decline")}
        >
          Decline
        </Button>
      </div>
    </li>
  );
}

export function MyInvitations({ onAccepted }: { onAccepted?: () => void }) {
  const { data: invitations } = useMyInvitations();
  const [searchParams] = useSearchParams();
  const prefill = searchParams.get("invitation") ?? "";

  if (!invitations || invitations.length === 0) return null;

  return (
    <ul className="flex flex-col divide-y rounded-md border">
      {invitations.map((invitation) => (
        <InvitationRow
          key={invitation.id}
          invitation={invitation}
          initialCode={invitations.length === 1 ? prefill : ""}
          onAccepted={onAccepted}
        />
      ))}
    </ul>
  );
}
