# Household Goals Separation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate household goals from personal goals so they exist independently, with any household member able to create/edit/delete household goals that track progress against household financial data.

**Architecture:** Add `entity_type`/`entity_id` columns to the `goals` table (mirroring the `reports` pattern). Update API endpoints to filter and authorize by entity. Update frontend hooks to pass entity context, and wire household Goals tab to use household entity.

**Tech Stack:** Supabase (PostgreSQL migration), Express API (TypeScript), React frontend (TanStack Query hooks), Zod schemas

---

## Task 1: Database Migration — Add entity columns to goals table

**Files:**
- Create: `packages/api/supabase/migrations/00014_goals_entity_columns.sql`

**Step 1: Write the migration SQL**

Create migration file with this content:

```sql
-- Add entity_type and entity_id to goals table
ALTER TABLE goals
  ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'user'
    CHECK (entity_type IN ('user', 'household')),
  ADD COLUMN entity_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

-- Backfill existing goals: entity_type='user', entity_id=user_id
UPDATE goals SET entity_type = 'user', entity_id = user_id;

-- Remove the placeholder default now that existing rows are backfilled
ALTER TABLE goals ALTER COLUMN entity_id DROP DEFAULT;

-- Index for efficient entity-based queries
CREATE INDEX idx_goals_entity ON goals (entity_type, entity_id);

-- Replace the old RLS policy with entity-aware policies
DROP POLICY IF EXISTS "Users manage own goals" ON goals;

-- Personal goals: user can manage goals where entity_id = their user id
CREATE POLICY "Users manage own goals" ON goals
  FOR ALL
  USING (entity_type = 'user' AND entity_id = auth.uid())
  WITH CHECK (entity_type = 'user' AND entity_id = auth.uid());

-- Household goals: any member of that household can manage
CREATE POLICY "Household members manage household goals" ON goals
  FOR ALL
  USING (
    entity_type = 'household'
    AND entity_id IN (
      SELECT household_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    entity_type = 'household'
    AND entity_id IN (
      SELECT household_id FROM profiles WHERE id = auth.uid()
    )
  );
```

**Step 2: Apply the migration to the test database**

Run the migration against the Supabase test project (ID: `ejraufbnlkyqtexbfyfr`) using the Supabase MCP `apply_migration` tool.

**Step 3: Verify the migration**

Run SQL against the test project to confirm:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'goals' AND column_name IN ('entity_type', 'entity_id');
```

Expected: two rows showing `entity_type TEXT NOT NULL` and `entity_id UUID NOT NULL`.

Also verify existing goals were backfilled:

```sql
SELECT id, user_id, entity_type, entity_id FROM goals LIMIT 5;
```

Expected: all rows have `entity_type = 'user'` and `entity_id = user_id`.

**Step 4: Commit**

```bash
git add packages/api/supabase/migrations/00014_goals_entity_columns.sql
git commit -m "feat: add entity_type/entity_id to goals table for household support"
```

---

## Task 2: Update shared Zod schemas and Goal type

**Files:**
- Modify: `packages/shared/src/schemas/goal.ts`

**Step 1: Update `createGoalSchema` to accept entity fields**

Add optional `entity_type` and `entity_id` to the create schema. These are optional — API defaults to `user`/`userId` when omitted.

Replace the full file content:

```typescript
import { z } from "zod";

export const goalTypeSchema = z.enum([
  "budget",
  "monthly_savings",
  "total_savings",
]);
export type GoalType = z.infer<typeof goalTypeSchema>;

export const entityTypeSchema = z.enum(["user", "household"]);
export type EntityType = z.infer<typeof entityTypeSchema>;

export const createGoalSchema = z.object({
  name: z.string().min(1).max(200),
  goal_type: goalTypeSchema,
  category_id: z.string().uuid().nullable().optional(),
  target_amount: z.number().positive(),
  target_date: z.string().date().nullable().optional(),
  entity_type: entityTypeSchema.optional(),
  entity_id: z.string().uuid().optional(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = createGoalSchema
  .omit({ entity_type: true, entity_id: true })
  .partial()
  .extend({
    current_amount: z.number().min(0).optional(),
  });

export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export interface Goal {
  id: string;
  user_id: string;
  entity_type: "user" | "household";
  entity_id: string;
  name: string;
  goal_type: GoalType;
  category_id: string | null;
  target_amount: number;
  target_date: string | null;
  current_amount: number;
  created_at: string;
  updated_at: string;
}

export const goalSuggestionSchema = z.object({
  name: z.string(),
  goal_type: goalTypeSchema,
  category: z.string().nullable(),
  target_amount: z.number().positive(),
  rationale: z.string(),
});
export type GoalSuggestion = z.infer<typeof goalSuggestionSchema>;
```

**Step 2: Verify typecheck passes**

Run: `cd /Users/matt/dev/Spendoza && bun run typecheck`

This will likely show errors in files that use `Goal` type since we added new required fields — that's expected and we'll fix those in subsequent tasks.

**Step 3: Commit**

```bash
git add packages/shared/src/schemas/goal.ts
git commit -m "feat: add entity_type/entity_id to Goal schema"
```

---

## Task 3: Update API goals routes for entity support

**Files:**
- Modify: `packages/api/src/routes/goals.ts`

**Step 1: Update GET /goals to accept entity query params**

Replace lines 88-101 (the `GET /` handler):

```typescript
// List goals filtered by entity
router.get("/", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const entityType = (req.query.entity_type as string) === "household" ? "household" : "user";

  let entityId = user.id;

  if (entityType === "household") {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();

    if (!profile?.household_id) {
      return res.status(400).json({ error: "No household found" });
    }
    entityId = profile.household_id;
  }

  const { data, error } = await supabaseAdmin
    .from("goals")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(data);
});
```

**Step 2: Update POST /goals to set entity fields**

Replace lines 104-119 (the `POST /` handler):

```typescript
// Create a goal
router.post("/", validate(createGoalSchema), async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const entityType = req.body.entity_type ?? "user";
  let entityId = req.body.entity_id ?? user.id;

  // For household goals, verify the user belongs to the household
  if (entityType === "household") {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();

    if (!profile?.household_id || profile.household_id !== entityId) {
      return res.status(403).json({ error: "Not a member of this household" });
    }
  }

  const { entity_type: _et, entity_id: _eid, ...goalFields } = req.body;

  const { data, error } = await supabaseAdmin
    .from("goals")
    .insert({
      ...goalFields,
      user_id: user.id,
      entity_type: entityType,
      entity_id: entityId,
    })
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json(data);
});
```

**Step 3: Update PUT /goals/:id for entity-aware access**

Replace lines 121-138 (the `PUT /:id` handler):

```typescript
// Update a goal
router.put("/:id", validate(updateGoalSchema), async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  // Fetch goal first to check access
  const { data: existing } = await supabaseAdmin
    .from("goals")
    .select("entity_type, entity_id")
    .eq("id", req.params.id)
    .single();

  if (!existing) {
    return res.status(404).json({ error: "Goal not found" });
  }

  // Verify access
  if (existing.entity_type === "user" && existing.entity_id !== user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (existing.entity_type === "household") {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();

    if (!profile?.household_id || profile.household_id !== existing.entity_id) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("goals")
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error || !data) {
    return res.status(400).json({ error: error?.message ?? "Update failed" });
  }

  return res.status(200).json(data);
});
```

**Step 4: Update DELETE /goals/:id for entity-aware access**

Replace lines 140-155 (the `DELETE /:id` handler):

```typescript
// Delete a goal
router.delete("/:id", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  // Fetch goal first to check access
  const { data: existing } = await supabaseAdmin
    .from("goals")
    .select("entity_type, entity_id")
    .eq("id", req.params.id)
    .single();

  if (!existing) {
    return res.status(404).json({ error: "Goal not found" });
  }

  // Verify access
  if (existing.entity_type === "user" && existing.entity_id !== user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (existing.entity_type === "household") {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();

    if (!profile?.household_id || profile.household_id !== existing.entity_id) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  const { error } = await supabaseAdmin
    .from("goals")
    .delete()
    .eq("id", req.params.id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(204).send();
});
```

**Step 5: Update GET /goals/progress for entity support**

Replace lines 157-269 (the `GET /progress` handler):

```typescript
// Get progress for goals with historical data
router.get("/progress", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const months = Math.min(parseInt(req.query.months as string) || 6, 24);
  const entityType = (req.query.entity_type as string) === "household" ? "household" : "user";

  let entityId = user.id;

  if (entityType === "household") {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();

    if (!profile?.household_id) {
      return res.status(400).json({ error: "No household found" });
    }
    entityId = profile.household_id;
  }

  // 1. Fetch goals for this entity (join category name for budget goals)
  const { data: goals, error: goalsError } = await supabaseAdmin
    .from("goals")
    .select("*, categories(name)")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (goalsError) {
    return res.status(400).json({ error: goalsError.message });
  }

  if (!goals || goals.length === 0) {
    return res.status(200).json({ goals: [] });
  }

  // Build a map of category_id -> category name for budget goals
  const categoryNameMap = new Map<string, string>();
  for (const g of goals) {
    if (g.category_id && (g as any).categories?.name) {
      categoryNameMap.set(g.category_id, (g as any).categories.name);
    }
  }

  // 2. Fetch reports for the past N months using the same entity
  const now = new Date();
  const monthKeys: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    monthKeys.push(d.toISOString().slice(0, 10));
  }

  const { data: reports } = await supabaseAdmin
    .from("reports")
    .select("report_month, report_data")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .in("report_month", monthKeys)
    .order("report_month", { ascending: true });

  const reportsByMonth = new Map<string, any>();
  for (const r of reports ?? []) {
    reportsByMonth.set(r.report_month, r.report_data);
  }

  // Current month key
  const currentMonthKey = monthKeys[0];
  const currentReport = reportsByMonth.get(currentMonthKey);

  // 3. Build progress for each goal
  const result = goals.map((goal: any) => {
    let current = 0;
    const history: Array<{ month: string; actual: number }> = [];

    if (goal.goal_type === "budget") {
      const catName = goal.category_id
        ? categoryNameMap.get(goal.category_id)?.toLowerCase()
        : undefined;

      if (currentReport?.by_category && catName) {
        const match = currentReport.by_category.find(
          (c: any) => c.category?.toLowerCase() === catName
        );
        current = match?.amount ?? 0;
      }

      for (const monthKey of monthKeys) {
        const report = reportsByMonth.get(monthKey);
        let actual = 0;
        if (report?.by_category && catName) {
          const match = report.by_category.find(
            (c: any) => c.category?.toLowerCase() === catName
          );
          actual = match?.amount ?? 0;
        }
        history.push({ month: monthKey, actual });
      }
    } else if (goal.goal_type === "monthly_savings") {
      if (currentReport) {
        current = (currentReport.total_income ?? 0) - (currentReport.total_expenses ?? 0);
      }

      for (const monthKey of monthKeys) {
        const report = reportsByMonth.get(monthKey);
        const actual = report
          ? (report.total_income ?? 0) - (report.total_expenses ?? 0)
          : 0;
        history.push({ month: monthKey, actual });
      }
    } else if (goal.goal_type === "total_savings") {
      current = goal.current_amount ?? 0;
    }

    return {
      goal,
      current,
      target: goal.target_amount,
      history: history.reverse(),
    };
  });

  return res.status(200).json({ goals: result });
});
```

**Step 6: Update GET /goals/suggestions to deduplicate by entity**

In the suggestions route (around line 56-61), change the existing goal name dedup query from filtering by `user_id` to filtering by `entity_type`/`entity_id`:

Replace:
```typescript
  const { data: existingGoals } = await supabaseAdmin
    .from("goals")
    .select("name")
    .eq("user_id", user.id);
```

With:
```typescript
  const { data: existingGoals } = await supabaseAdmin
    .from("goals")
    .select("name")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
```

**Step 7: Verify typecheck passes**

Run: `cd /Users/matt/dev/Spendoza && bun run typecheck`

Expected: passes (or only frontend errors remain, fixed in later tasks).

**Step 8: Commit**

```bash
git add packages/api/src/routes/goals.ts
git commit -m "feat: update goals API routes for entity_type/entity_id support"
```

---

## Task 4: Update frontend hooks for entity support

**Files:**
- Modify: `packages/web/src/hooks/use-goals.ts`

**Step 1: Update all hooks to accept entity params**

Replace the full file content:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type {
  Goal,
  GoalSuggestion,
  CreateGoalInput,
  UpdateGoalInput,
} from "@spendoza/shared";

export interface GoalProgress {
  goal: Goal;
  current: number;
  target: number;
  history: Array<{ month: string; actual: number }>;
}

export function useGoals(entityType: "user" | "household" = "user") {
  return useQuery<Goal[]>({
    queryKey: ["goals", entityType],
    queryFn: () => apiClient(`/goals?entity_type=${entityType}`),
  });
}

export function useGoalProgress(
  months = 6,
  entityType: "user" | "household" = "user"
) {
  return useQuery<{ goals: GoalProgress[] }>({
    queryKey: ["goals", "progress", entityType, months],
    queryFn: () =>
      apiClient(
        `/goals/progress?months=${months}&entity_type=${entityType}`
      ),
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateGoalInput) =>
      apiClient("/goals", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateGoalInput }) =>
      apiClient(`/goals/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/goals/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

export interface GoalSuggestionsResponse {
  suggestions: GoalSuggestion[];
  report_month: string | null;
}

export function useGoalSuggestions(entityType: "user" | "household" = "user", enabled = true) {
  return useQuery<GoalSuggestionsResponse>({
    queryKey: ["goals", "suggestions", entityType],
    queryFn: () => apiClient(`/goals/suggestions?entity_type=${entityType}`),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
```

**Step 2: Verify typecheck**

Run: `cd /Users/matt/dev/Spendoza && bun run typecheck`

**Step 3: Commit**

```bash
git add packages/web/src/hooks/use-goals.ts
git commit -m "feat: add entity_type support to goals hooks"
```

---

## Task 5: Update GoalForm and SuggestedGoals components for entity context

**Files:**
- Modify: `packages/web/src/components/goals/goal-form.tsx`
- Modify: `packages/web/src/components/goals/suggested-goals.tsx`

**Step 1: Update GoalForm to accept and pass entity props**

In `packages/web/src/components/goals/goal-form.tsx`, update the component props and the submit handler.

Change the component signature (line 22-32) to accept optional entity props:

```typescript
export function GoalForm({
  open,
  onOpenChange,
  goal,
  categories,
  entityType,
  entityId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: Goal | null;
  categories: Category[];
  entityType?: "user" | "household";
  entityId?: string;
}) {
```

In the `handleSubmit` function (around line 55-78), update the data object to include entity fields when provided:

Replace the data construction:

```typescript
    const data: any = {
      name: name.trim(),
      goal_type: goalType,
      category_id: goalType === "budget" ? categoryId || null : null,
      target_amount: parseFloat(targetAmount),
      target_date: goalType === "total_savings" && targetDate ? targetDate : null,
    };

    try {
      if (isEditing && goal) {
        await updateGoal.mutateAsync({ id: goal.id, data });
      } else {
        await createGoal.mutateAsync(data);
      }
```

With:

```typescript
    const data: any = {
      name: name.trim(),
      goal_type: goalType,
      category_id: goalType === "budget" ? categoryId || null : null,
      target_amount: parseFloat(targetAmount),
      target_date: goalType === "total_savings" && targetDate ? targetDate : null,
    };

    // Add entity fields for new goals (not edits — entity can't change)
    if (!isEditing && entityType && entityId) {
      data.entity_type = entityType;
      data.entity_id = entityId;
    }

    try {
      if (isEditing && goal) {
        await updateGoal.mutateAsync({ id: goal.id, data });
      } else {
        await createGoal.mutateAsync(data);
      }
```

**Step 2: Update SuggestedGoals to pass entity context when creating goals**

In `packages/web/src/components/goals/suggested-goals.tsx`, update the component props and the `handleAdd` function.

Change the component signature (line 21-27) to also accept `entityId`:

```typescript
export function SuggestedGoals({
  entityType,
  categories,
  entityId,
}: {
  entityType: "user" | "household";
  categories: Category[];
  entityId?: string;
}) {
```

In the `handleAdd` function (around line 39-66), update the `createGoal.mutateAsync` call to include entity fields:

Replace:

```typescript
      await createGoal.mutateAsync({
        name: suggestion.name,
        goal_type: suggestion.goal_type,
        category_id: categoryId,
        target_amount: suggestion.target_amount,
      });
```

With:

```typescript
      await createGoal.mutateAsync({
        name: suggestion.name,
        goal_type: suggestion.goal_type,
        category_id: categoryId,
        target_amount: suggestion.target_amount,
        ...(entityType && entityId ? { entity_type: entityType, entity_id: entityId } : {}),
      });
```

**Step 3: Verify typecheck**

Run: `cd /Users/matt/dev/Spendoza && bun run typecheck`

**Step 4: Commit**

```bash
git add packages/web/src/components/goals/goal-form.tsx packages/web/src/components/goals/suggested-goals.tsx
git commit -m "feat: pass entity context through GoalForm and SuggestedGoals"
```

---

## Task 6: Update Personal Goals page to pass entity context

**Files:**
- Modify: `packages/web/src/pages/goals.tsx`

**Step 1: Update hook calls to pass entity_type="user"**

The personal goals page at `packages/web/src/pages/goals.tsx` uses `useGoalProgress(6)`. Update it to explicitly pass `"user"`:

Change line 23:
```typescript
  const { data: progressData, isLoading, error, refetch } = useGoalProgress(6, "user");
```

This is technically the default, but being explicit ensures correctness.

**Step 2: Verify typecheck**

Run: `cd /Users/matt/dev/Spendoza && bun run typecheck`

**Step 3: Commit**

```bash
git add packages/web/src/pages/goals.tsx
git commit -m "feat: explicitly pass entity_type=user on personal goals page"
```

---

## Task 7: Update Household Goals tab to use household entity

**Files:**
- Modify: `packages/web/src/pages/household-dashboard.tsx` (the `HouseholdGoalsTab` function, lines 173-321)

**Step 1: Pass householdId into HouseholdGoalsTab**

The `HouseholdGoalsTab` function is defined inside `household-dashboard.tsx`. It needs access to the household ID. The parent component already has `household` from `useHousehold()`.

Change the function signature from:
```typescript
function HouseholdGoalsTab() {
```
to:
```typescript
function HouseholdGoalsTab({ householdId }: { householdId: string }) {
```

**Step 2: Update the hook calls inside HouseholdGoalsTab**

Change line 174 from:
```typescript
  const { data: progressData, isLoading, error, refetch } = useGoalProgress(6);
```
to:
```typescript
  const { data: progressData, isLoading, error, refetch } = useGoalProgress(6, "household");
```

**Step 3: Pass entity props to SuggestedGoals**

Change line 260 from:
```typescript
      <SuggestedGoals entityType="household" categories={categories ?? []} />
```
to:
```typescript
      <SuggestedGoals entityType="household" entityId={householdId} categories={categories ?? []} />
```

**Step 4: Pass entity props to GoalForm**

Change lines 305-310 from:
```typescript
      <GoalForm
        open={formOpen}
        onOpenChange={handleFormClose}
        goal={editingGoal}
        categories={categories ?? []}
      />
```
to:
```typescript
      <GoalForm
        open={formOpen}
        onOpenChange={handleFormClose}
        goal={editingGoal}
        categories={categories ?? []}
        entityType="household"
        entityId={householdId}
      />
```

**Step 5: Update the call site that renders HouseholdGoalsTab**

Search in the file for where `<HouseholdGoalsTab` is rendered and pass the household ID. It will be inside a `<TabsContent value="goals">`. Change it from:

```tsx
<HouseholdGoalsTab />
```

to:

```tsx
<HouseholdGoalsTab householdId={household.id} />
```

**Step 6: Verify typecheck**

Run: `cd /Users/matt/dev/Spendoza && bun run typecheck`

**Step 7: Commit**

```bash
git add packages/web/src/pages/household-dashboard.tsx
git commit -m "feat: wire household Goals tab to use household entity"
```

---

## Task 8: Run all tests and verify

**Step 1: Run the full test suite**

Run: `cd /Users/matt/dev/Spendoza && bun run test`

Fix any failures that arise from the schema changes. The most likely issues:
- `packages/api/src/ai/__tests__/goal-suggestions.test.ts` — should still pass (no schema changes affect it)
- `packages/api/src/services/__tests__/report.test.ts` — should still pass (no report changes)
- `packages/api/src/__tests__/unit/email.service.test.ts` — should still pass

**Step 2: Run typecheck across all packages**

Run: `cd /Users/matt/dev/Spendoza && bun run typecheck`

**Step 3: Fix any remaining issues and commit**

If any test or type errors, fix them and commit with:

```bash
git commit -m "fix: resolve test/type issues from goals entity changes"
```

---

## Verification Checklist

After all tasks are complete:

1. `bun run typecheck` passes across all packages
2. `bun run test` passes
3. Migration applied to test database — goals table has `entity_type`/`entity_id` columns
4. Personal Goals page (`/goals`) shows only personal goals (entity_type=user)
5. Household Goals tab (`/household` > Goals) shows only household goals (entity_type=household)
6. Creating a goal on the personal page sets entity_type=user, entity_id=userId
7. Creating a goal on the household tab sets entity_type=household, entity_id=householdId
8. Any household member can edit/delete household goals
9. AI suggestions on household tab create household-scoped goals
