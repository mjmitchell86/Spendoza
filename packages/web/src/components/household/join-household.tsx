import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useJoinHousehold } from "@/hooks/use-household";

export function JoinHousehold() {
  const joinHousehold = useJoinHousehold();
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await joinHousehold.mutateAsync({ invite_code: inviteCode.trim() });
      setInviteCode("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to join household"
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join a Household</CardTitle>
        <CardDescription>
          Enter the invite code from your household head to join an existing
          household.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite_code">Invite Code</Label>
            <Input
              id="invite_code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Enter invite code"
              required
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={joinHousehold.isPending}>
            {joinHousehold.isPending ? "Joining..." : "Join Household"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
