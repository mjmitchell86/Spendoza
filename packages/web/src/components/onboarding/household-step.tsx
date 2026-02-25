import { useState, type FormEvent } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCreateHousehold,
  useJoinHousehold,
} from "@/hooks/use-household";
import { SharingConfig } from "@/components/household/sharing-config";

interface HouseholdStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function HouseholdStep({ onNext, onSkip }: HouseholdStepProps) {
  const createHousehold = useCreateHousehold();
  const joinHousehold = useJoinHousehold();

  const [householdName, setHouseholdName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [householdCreated, setHouseholdCreated] = useState(false);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createHousehold.mutateAsync({ name: householdName.trim() });
      setHouseholdCreated(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create household"
      );
    }
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await joinHousehold.mutateAsync({ invite_code: inviteCode.trim() });
      setHouseholdCreated(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to join household"
      );
    }
  }

  if (householdCreated) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Users className="size-6 text-primary" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">
            Sharing Preferences
          </h2>
          <p className="text-sm text-muted-foreground">
            Configure how your income and expenses are shared with your
            household. You can change these later in settings.
          </p>
        </div>

        <SharingConfig
          currentIncomeMode="none"
          currentExpenseMode="none"
          currentSharedAmount={null}
        />

        <div className="text-center">
          <Button onClick={onNext}>Continue</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <Users className="size-6 text-primary" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">
          Set Up Your Household
        </h2>
        <p className="text-sm text-muted-foreground">
          Share finances with your family by creating or joining a household.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Tabs defaultValue="create" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="create">Create New</TabsTrigger>
          <TabsTrigger value="join">Join Existing</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <form onSubmit={handleCreate} className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ob_household_name">Household Name</Label>
              <Input
                id="ob_household_name"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="e.g. The Smiths"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={createHousehold.isPending}
              className="w-full"
            >
              {createHousehold.isPending
                ? "Creating..."
                : "Create Household"}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="join">
          <form onSubmit={handleJoin} className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ob_invite_code">Invite Code</Label>
              <Input
                id="ob_invite_code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Enter invite code"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={joinHousehold.isPending}
              className="w-full"
            >
              {joinHousehold.isPending ? "Joining..." : "Join Household"}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      <div className="text-center">
        <Button variant="ghost" onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    </div>
  );
}
