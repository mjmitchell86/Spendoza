# Household Goals Separation Design

## Problem

Goals are currently stored with only a `user_id` — there's no concept of household-scoped goals. The household dashboard's Goals tab uses the same hooks as the personal Goals page, so both show the same goals. Users need separate personal and household goals, where any household member can create/edit/delete household goals, and household goals track progress against combined household financial data.

## Decisions

- **Progress data source**: Household goals use household report data (combined income/expenses from sharing members). Personal goals use user report data.
- **Edit access**: Any household member can edit or delete any household goal (true shared ownership).
- **UI location**: Personal goals on `/goals` page. Household goals on `/household` Goals tab (already exists but currently shows personal goals).

## Database

Add `entity_type` and `entity_id` columns to `goals` table, following the same pattern as `reports`:

```sql
ALTER TABLE goals
  ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'user'
    CHECK (entity_type IN ('user', 'household')),
  ADD COLUMN entity_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

-- Backfill existing goals
UPDATE goals SET entity_type = 'user', entity_id = user_id;

-- Drop old RLS policy, create new ones
DROP POLICY "Users manage own goals" ON goals;

-- Personal goals: user can manage their own
CREATE POLICY "Users manage own goals" ON goals
  FOR ALL
  USING (entity_type = 'user' AND entity_id = auth.uid())
  WITH CHECK (entity_type = 'user' AND entity_id = auth.uid());

-- Household goals: any member of the household can manage
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

-- Index for efficient queries
CREATE INDEX idx_goals_entity ON goals (entity_type, entity_id);
```

The `user_id` column is kept as-is — it records who created the goal (useful for audit). But filtering/access is via `entity_type`/`entity_id`.

## API Changes

### GET /goals
Add query params `entity_type` (default `'user'`) and `entity_id`. Filter goals by these columns instead of just `user_id`.

### GET /goals/progress
Add `entity_type` and `entity_id` query params. Fetch goals filtered by entity. Fetch reports matching the same `entity_type`/`entity_id` for progress calculation.

### POST /goals
Accept `entity_type` and `entity_id` in request body. For household goals, validate the user belongs to that household. Always set `user_id` to the authenticated user (creator).

### PUT /goals/:id and DELETE /goals/:id
Remove the `user_id` filter. Instead, verify access: for personal goals, check `entity_id = user.id`. For household goals, check user belongs to the household.

### GET /goals/suggestions
Already supports `entity_type`. Update the deduplication query to check existing goals by `entity_type`/`entity_id` instead of just `user_id`.

## Shared Schema Changes

Update `createGoalSchema` to accept optional `entity_type` and `entity_id`. Update `Goal` interface to include these fields.

## Frontend Changes

### Hooks (`use-goals.ts`)
- All hooks accept optional `entityType`/`entityId` params
- Query keys include entity info for proper cache separation
- `useGoalProgress(months, entityType, entityId)` passes entity params to API

### Personal Goals page (`/goals`)
- Passes `entity_type=user` and `entity_id=userId` to hooks (default behavior, minimal changes)

### Household Goals tab (`/household` > Goals)
- Passes `entity_type=household` and `entity_id=householdId` to hooks
- `GoalForm` receives entity props and includes them in create/update calls
- `SuggestedGoals` already passes `entityType="household"` — also needs to pass entity info when creating goals

### Shared components (`GoalCard`, `GoalForm`, `LogSavingsDialog`, `SuggestedGoals`)
- Accept optional `entityType`/`entityId` props
- Pass through to create/update mutations
