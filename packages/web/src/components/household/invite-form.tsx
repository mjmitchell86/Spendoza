import { useState, type FormEvent } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInviteToHousehold } from "@/hooks/use-household";

interface InviteFormProps {
  inviteCode: string;
}

export function InviteForm({ inviteCode }: InviteFormProps) {
  const invite = useInviteToHousehold();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    try {
      await invite.mutateAsync({ email: email.trim() });
      setEmail("");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invite");
    }
  }

  async function handleCopyCode() {
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Invite code section */}
      <div className="flex flex-col gap-2">
        <Label>Invite Code</Label>
        <div className="flex gap-2">
          <Input
            value={inviteCode}
            readOnly
            className="font-mono"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => void handleCopyCode()}
          >
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
            <span className="sr-only">Copy invite code</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Share this code with people you want to join your household.
        </p>
      </div>

      {/* Email invite */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Label htmlFor="invite_email">Or Invite by Email</Label>
        {error && (
          <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
            Invite sent successfully!
          </div>
        )}
        <div className="flex gap-2">
          <Input
            id="invite_email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            required
          />
          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending ? "Sending..." : "Invite"}
          </Button>
        </div>
      </form>
    </div>
  );
}
