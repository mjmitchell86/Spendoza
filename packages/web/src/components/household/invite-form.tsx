import { useState, type FormEvent } from "react";
import { Copy, Check, Share2, RefreshCw } from "lucide-react";
import { formatInviteCode } from "@spendoza/shared";
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
import { useInviteToHousehold, useRotateInviteCode } from "@/hooks/use-household";

interface InviteFormProps {
  inviteCode: string;
}

export function InviteForm({ inviteCode }: InviteFormProps) {
  const invite = useInviteToHousehold();
  const rotate = useRotateInviteCode();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  // Show the freshly rotated code right away, until the prop catches up.
  const [rotated, setRotated] = useState<{ from: string; code: string } | null>(null);
  const currentCode = rotated && rotated.from === inviteCode ? rotated.code : inviteCode;
  const displayCode = formatInviteCode(currentCode);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    try {
      await invite.mutateAsync({ email: email.trim() });
      setEmail("");
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't send the invitation email. Try again.",
      );
    }
  }

  async function handleCopyCode() {
    await navigator.clipboard.writeText(displayCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    try {
      await navigator.share({ text: `Join my household on Spendoza with code ${displayCode}` });
    } catch {
      // Dismissing the share sheet rejects; nothing to do.
    }
  }

  async function handleRotate() {
    setRotateError(null);
    try {
      const result = await rotate.mutateAsync();
      setRotated({ from: inviteCode, code: result.invite_code });
      setConfirmOpen(false);
    } catch (err) {
      setRotateError(err instanceof Error ? err.message : "Failed to generate a new code");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Invite code section */}
      <div className="flex flex-col gap-2">
        <Label>Invite Code</Label>
        <div className="rounded-md border bg-muted/40 px-4 py-3 text-center font-mono text-2xl tracking-widest">
          {displayCode}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void handleCopyCode()}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            Copy
          </Button>
          {canShare && (
            <Button variant="outline" size="sm" onClick={() => void handleShare()}>
              <Share2 className="size-4" />
              Share
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRotateError(null);
              setConfirmOpen(true);
            }}
          >
            <RefreshCw className="size-4" />
            Get a new code
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Share this code with people you want to join your household.
        </p>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Get a new code?</DialogTitle>
            <DialogDescription>
              Anyone who has the old code won't be able to use it. People already in your
              household stay.
            </DialogDescription>
          </DialogHeader>
          {rotateError && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {rotateError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleRotate()} disabled={rotate.isPending}>
              {rotate.isPending ? "Working..." : "Get a new code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email invite */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Label htmlFor="invite_email">Invite by email</Label>
        {error && (
          <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
            Invitation sent
          </div>
        )}
        <div className="flex gap-2">
          <Input
            id="invite_email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSuccess(false);
            }}
            placeholder="email@example.com"
            required
          />
          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending ? "Sending..." : "Send invitation"}
          </Button>
        </div>
      </form>
    </div>
  );
}
