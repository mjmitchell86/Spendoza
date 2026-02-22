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
import { useCreateHousehold } from "@/hooks/use-household";

export function CreateHousehold() {
  const createHousehold = useCreateHousehold();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createHousehold.mutateAsync({ name: name.trim() });
      setName("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create household"
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a Household</CardTitle>
        <CardDescription>
          Start a new household and invite your family members to join.
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
            <Label htmlFor="household_name">Household Name</Label>
            <Input
              id="household_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Smiths"
              required
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={createHousehold.isPending}>
            {createHousehold.isPending ? "Creating..." : "Create Household"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
