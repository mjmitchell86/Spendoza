import type { ServiceContext } from "./context";

export async function getProfile(ctx: ServiceContext) {
  return ctx.supabase
    .from("profiles")
    .select("*")
    .eq("id", ctx.userId)
    .single();
}

export async function updateProfile(ctx: ServiceContext, input: Record<string, any>) {
  return ctx.supabase
    .from("profiles")
    .update(input)
    .eq("id", ctx.userId)
    .select()
    .single();
}
