import { isPlanError, PLANS_URL } from "@/lib/api-error";

/** Shown when the API refuses an action because of the plan. */
export function PlanRequired() {
  return (
    <div className="rounded-md bg-muted px-4 py-3 text-sm">
      Not available on your plan yet.{" "}
      <a href={PLANS_URL} className="font-medium text-primary underline-offset-4 hover:underline">
        Plans &amp; billing
      </a>
    </div>
  );
}

/**
 * An action's error: the plan message for a plan refusal (a body with
 * `required_tier`), otherwise the API message verbatim.
 */
export function ActionError({ error, fallback }: { error: unknown; fallback: string }) {
  if (error == null) return null;
  if (isPlanError(error)) return <PlanRequired />;
  return (
    <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {error instanceof Error ? error.message : fallback}
    </div>
  );
}
