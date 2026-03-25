import type { CreateDebtInput, UpdateDebtInput, Debt } from "@spendoza/shared";
import type { ServiceContext } from "./context";
import { resolveEntity } from "./household.service";
import {
  projectSingleDebt,
  calculatePayoffStrategy,
} from "./debt-projection.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function checkDebtAccess(
  ctx: ServiceContext,
  debtId: string
): Promise<{ allowed: boolean; debt?: any; error?: { message: string } }> {
  const { data: debt } = await ctx.supabase
    .from("debts")
    .select("*")
    .eq("id", debtId)
    .single();

  if (!debt) return { allowed: false };

  if (debt.entity_type === "user") {
    return { allowed: debt.entity_id === ctx.userId, debt };
  }

  // Household: check membership
  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("household_id")
    .eq("id", ctx.userId)
    .single();

  return {
    allowed: !!profile?.household_id && profile.household_id === debt.entity_id,
    debt,
  };
}

// ---------------------------------------------------------------------------
// listDebts
// ---------------------------------------------------------------------------
export async function listDebts(
  ctx: ServiceContext,
  entityType?: string
): Promise<{ data: any[] | null; error: { message: string } | null }> {
  const resolved = await resolveEntity(ctx, entityType);
  if (resolved.error) return { data: null, error: resolved.error };

  const { entityType: eType, entityId } = resolved.data!;

  const { data, error } = await ctx.supabase
    .from("debts")
    .select("*")
    .eq("entity_type", eType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: { message: error.message } };
  return { data: data ?? [], error: null };
}

// ---------------------------------------------------------------------------
// createDebt
// ---------------------------------------------------------------------------
export async function createDebt(
  ctx: ServiceContext,
  input: CreateDebtInput
): Promise<{ data: any | null; error: { message: string } | null }> {
  const resolved = await resolveEntity(ctx, input.entity_type);
  if (resolved.error) return { data: null, error: resolved.error };

  const { entityType, entityId } = resolved.data!;

  const { data, error } = await ctx.supabase
    .from("debts")
    .insert({
      user_id: ctx.userId,
      entity_type: entityType,
      entity_id: entityId,
      name: input.name,
      debt_type: input.debt_type,
      original_balance: input.original_balance,
      current_balance: input.current_balance,
      interest_rate: input.interest_rate ?? 0,
      minimum_payment: input.minimum_payment ?? 0,
      due_date_day: input.due_date_day ?? null,
      linked_category_id: input.linked_category_id ?? null,
    })
    .select()
    .single();

  if (error) return { data: null, error: { message: error.message } };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// updateDebt
// ---------------------------------------------------------------------------
export async function updateDebt(
  ctx: ServiceContext,
  id: string,
  input: UpdateDebtInput
): Promise<{ data: any | null; error: { message: string } | null }> {
  const access = await checkDebtAccess(ctx, id);

  if (!access.allowed) {
    if (!access.debt) {
      return { data: null, error: { message: "Debt not found" } };
    }
    return { data: null, error: { message: "Access denied" } };
  }

  const { data, error } = await ctx.supabase
    .from("debts")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return { data: null, error: { message: error?.message ?? "Update failed" } };
  }
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// deleteDebt
// ---------------------------------------------------------------------------
export async function deleteDebt(
  ctx: ServiceContext,
  id: string
): Promise<{ error: { message: string } | null }> {
  const access = await checkDebtAccess(ctx, id);

  if (!access.allowed) {
    if (!access.debt) {
      return { error: { message: "Debt not found" } };
    }
    return { error: { message: "Access denied" } };
  }

  const { error } = await ctx.supabase
    .from("debts")
    .delete()
    .eq("id", id);

  if (error) return { error: { message: error.message } };
  return { error: null };
}

// ---------------------------------------------------------------------------
// getDebtProjections
// ---------------------------------------------------------------------------
export async function getDebtProjections(
  ctx: ServiceContext,
  entityType?: string,
  extraPayment?: number
): Promise<{
  data: {
    individual: any[];
    avalanche: any;
    snowball: any;
  } | null;
  error: { message: string } | null;
}> {
  const resolved = await resolveEntity(ctx, entityType);
  if (resolved.error) return { data: null, error: resolved.error };

  const { entityType: eType, entityId } = resolved.data!;
  const extra = extraPayment ?? 0;

  const { data: debts, error } = await ctx.supabase
    .from("debts")
    .select("*")
    .eq("entity_type", eType)
    .eq("entity_id", entityId)
    .gt("current_balance", 0)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: { message: error.message } };

  const individual = (debts as Debt[]).map(projectSingleDebt);
  const avalanche = calculatePayoffStrategy(debts as Debt[], extra, "avalanche");
  const snowball = calculatePayoffStrategy(debts as Debt[], extra, "snowball");

  return { data: { individual, avalanche, snowball }, error: null };
}
