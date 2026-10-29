// packages/api/src/services/account.service.ts
//
// Permanent account deletion, shared by self-service (DELETE /api/profile) and
// admin (DELETE /api/admin/users/:id).
//
// Deleting the auth user cascades (via FKs) to the profile and every per-user
// table: categories, income, expenses, bank statements, transactions, report
// requests, goals, debts, subscriptions, email jobs/log, advice questions and
// MCP auth codes. invite_codes and llm_usage_log are kept but de-identified
// (user columns SET NULL). Everything the cascade can't reach, or that would
// block it, is handled here first:
//
//   1. Read-only checks (user exists, household role, subscription).
//      A head of household with other members is refused — they must transfer
//      ownership first; we never silently pick a new head.
//   2. Unblock FKs that have no ON DELETE action: leave/delete the household,
//      delete invitations they sent (and ones addressed to them), and clear
//      attribution pointing at them from other users' income/transactions.
//   3. Stop billing: cancel the Stripe subscription and delete the customer.
//   4. Delete data outside the cascade: reports rows (no FK), Storage objects
//      (avatars + bank-statements) and their waitlist row.
//   5. Delete the auth user (the irreversible cascade), last.
//
// Any failure in steps 1–5 aborts before the auth user is deleted, so the user
// still has a working account and can simply retry; every step is idempotent.

import Stripe from "stripe";
import { supabaseAdmin } from "../lib/supabase";

export type AccountDeletionErrorCode =
  | "NOT_FOUND"
  | "HOUSEHOLD_HEAD_HAS_MEMBERS"
  | "FAILED";

export class AccountDeletionError extends Error {
  constructor(
    public code: AccountDeletionErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AccountDeletionError";
  }
}

export const HOUSEHOLD_HEAD_HAS_MEMBERS_MESSAGE =
  "You're the head of a household that has other members. Transfer household ownership to another member before deleting your account.";

const FAILED_MESSAGE =
  "We couldn't delete your account. Please try again, or contact support if this keeps happening.";

const STORAGE_BUCKETS = ["avatars", "bank-statements"] as const;
const STORAGE_PAGE_SIZE = 1000;

type SupabaseResult = { error: { message?: string; code?: string } | null };

function log(userId: string, msg: string) {
  console.log(`[account] [${userId}] ${msg}`);
}

function fail(userId: string, step: string, err: unknown): never {
  // Log only the step and the error code/message — never emails, names or file paths.
  const e = err as { code?: string; message?: string } | null;
  console.error(
    `[account] [${userId}] deletion aborted at "${step}": ${e?.code ?? ""} ${e?.message ?? String(err)}`.trim()
  );
  throw new AccountDeletionError("FAILED", FAILED_MESSAGE);
}

/** Run a Supabase query; abort the deletion if it returns an error. */
async function run(userId: string, step: string, query: PromiseLike<SupabaseResult>) {
  let result: SupabaseResult;
  try {
    result = await query;
  } catch (err) {
    fail(userId, step, err);
  }
  if (result.error) fail(userId, step, result.error);
}

function isStripeMissing(err: unknown) {
  const e = err as { code?: string; statusCode?: number } | null;
  return e?.code === "resource_missing" || e?.statusCode === 404;
}

// ---------------------------------------------------------------------------
// Storage: list every object under `${userId}/` (recursively) and remove it.
// ---------------------------------------------------------------------------
async function listObjects(bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .list(prefix, { limit: STORAGE_PAGE_SIZE, offset });
    if (error) {
      // A bucket that doesn't exist holds no objects for this user.
      if (/bucket not found/i.test(error.message)) return paths;
      throw error;
    }
    const entries = data ?? [];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      // Folders are returned with a null id
      if (entry.id === null) paths.push(...(await listObjects(bucket, path)));
      else paths.push(path);
    }
    if (entries.length < STORAGE_PAGE_SIZE) return paths;
  }
}

async function removeUserStorage(userId: string) {
  for (const bucket of STORAGE_BUCKETS) {
    let paths: string[];
    try {
      paths = await listObjects(bucket, userId);
    } catch (err) {
      fail(userId, `list ${bucket} storage`, err);
    }
    for (let i = 0; i < paths.length; i += STORAGE_PAGE_SIZE) {
      const { error } = await supabaseAdmin.storage
        .from(bucket)
        .remove(paths.slice(i, i + STORAGE_PAGE_SIZE));
      if (error) fail(userId, `remove ${bucket} storage`, error);
    }
    if (paths.length > 0) log(userId, `removed ${paths.length} object(s) from ${bucket}`);
  }
}

// ---------------------------------------------------------------------------
// Stripe: cancel the subscription and delete the customer (if configured).
// ---------------------------------------------------------------------------
async function cancelStripe(
  userId: string,
  sub: { stripe_customer_id: string | null; stripe_subscription_id: string | null } | null
) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !sub?.stripe_customer_id) return;
  const stripe = new Stripe(key);

  if (sub.stripe_subscription_id) {
    try {
      const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      if (current.status !== "canceled") {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id);
        log(userId, "cancelled Stripe subscription");
      }
    } catch (err) {
      if (!isStripeMissing(err)) fail(userId, "cancel Stripe subscription", err);
    }
  }

  try {
    await stripe.customers.del(sub.stripe_customer_id);
    log(userId, "deleted Stripe customer");
  } catch (err) {
    if (!isStripeMissing(err)) fail(userId, "delete Stripe customer", err);
  }
}

// ---------------------------------------------------------------------------
// deleteAccount
// ---------------------------------------------------------------------------
export async function deleteAccount(userId: string): Promise<void> {
  log(userId, "account deletion started");

  // ---- 1. Read-only checks ------------------------------------------------
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.getUserById(userId);
  const authUser = authData?.user;
  if (!authUser) {
    const status = (authError as { status?: number } | null)?.status;
    if (authError && status !== 404) fail(userId, "look up auth user", authError);
    throw new AccountDeletionError("NOT_FOUND", "User not found");
  }
  const email = authUser.email?.toLowerCase() ?? null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, household_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) fail(userId, "load profile", profileError);

  let household: { id: string; head_of_household_id: string } | null = null;
  let otherMemberCount = 0;
  if (profile?.household_id) {
    const { data: hh, error: hhError } = await supabaseAdmin
      .from("households")
      .select("id, head_of_household_id")
      .eq("id", profile.household_id)
      .single();
    if (hhError || !hh) fail(userId, "load household", hhError ?? { message: "not found" });
    household = hh;

    const { data: members, error: membersError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("household_id", household.id);
    if (membersError) fail(userId, "load household members", membersError);
    otherMemberCount = (members ?? []).filter((m: { id: string }) => m.id !== userId).length;

    if (household.head_of_household_id === userId && otherMemberCount > 0) {
      log(userId, "refused: head of household with other members");
      throw new AccountDeletionError(
        "HOUSEHOLD_HEAD_HAS_MEMBERS",
        HOUSEHOLD_HEAD_HAS_MEMBERS_MESSAGE
      );
    }
  }

  const { data: subscription, error: subError } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (subError) fail(userId, "load subscription", subError);

  // ---- 2. Unblock FKs that have no ON DELETE action -------------------------
  if (household) {
    const hhId = household.id;
    if (household.head_of_household_id === userId) {
      // Head and sole member: the household goes with them.
      await run(userId, "leave household",
        supabaseAdmin.from("profiles").update({ household_id: null }).eq("id", userId));
      await run(userId, "delete household reports",
        supabaseAdmin.from("reports").delete().eq("entity_type", "household").eq("entity_id", hhId));
      await run(userId, "delete household",
        supabaseAdmin.from("households").delete().eq("id", hhId));
      log(userId, "deleted household (sole member)");
    } else {
      // Member: household goals/debts belong to the household, so hand the ones
      // they created to the head instead of letting the cascade delete them.
      const headId = household.head_of_household_id;
      await run(userId, "reassign household goals",
        supabaseAdmin.from("goals").update({ user_id: headId })
          .eq("user_id", userId).eq("entity_type", "household").eq("entity_id", hhId));
      await run(userId, "reassign household debts",
        supabaseAdmin.from("debts").update({ user_id: headId })
          .eq("user_id", userId).eq("entity_type", "household").eq("entity_id", hhId));
      // Regenerate household reports without this member's data.
      await run(userId, "mark household reports stale",
        supabaseAdmin.from("reports").update({ has_new_data: true })
          .eq("entity_type", "household").eq("entity_id", hhId));
      await run(userId, "leave household",
        supabaseAdmin.from("profiles").update({ household_id: null }).eq("id", userId));
      log(userId, "left household");
    }
  }

  await run(userId, "delete sent invitations",
    supabaseAdmin.from("household_invitations").delete().eq("invited_by", userId));
  if (email) {
    await run(userId, "delete received invitations",
      supabaseAdmin.from("household_invitations").delete().eq("email", email.toLowerCase()));
  }

  await run(userId, "clear income attribution",
    supabaseAdmin.from("income_entries").update({ attributed_to_user_id: null })
      .eq("attributed_to_user_id", userId));
  await run(userId, "clear transaction attribution",
    supabaseAdmin.from("transactions").update({ attributed_to_user_id: null })
      .eq("attributed_to_user_id", userId));

  // ---- 3. Stop billing ------------------------------------------------------
  await cancelStripe(userId, subscription);

  // ---- 4. Data the cascade doesn't reach ------------------------------------
  await run(userId, "delete reports",
    supabaseAdmin.from("reports").delete().eq("entity_type", "user").eq("entity_id", userId));
  await removeUserStorage(userId);
  if (email) {
    await run(userId, "delete waitlist entry",
      supabaseAdmin.from("waitlist").delete().eq("email", email));
  }

  // ---- 5. Delete the auth user (cascades to profile + all user tables) ------
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteError) fail(userId, "delete auth user", deleteError);

  // A report generated by an in-flight background job could have landed after
  // step 4 (reports has no FK). Sweep once more; failure here is non-fatal.
  const { error: sweepError } = await supabaseAdmin
    .from("reports")
    .delete()
    .eq("entity_type", "user")
    .eq("entity_id", userId);
  if (sweepError) {
    console.error(`[account] [${userId}] post-delete report sweep failed: ${sweepError.message}`);
  }

  log(userId, "account deleted");
}
