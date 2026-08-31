import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAdminStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await import("./admin.server");
    return { admin: await isAdmin(context.userId) };
  });

export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin, listUsers } = await import("./admin.server");
    await assertAdmin(context.userId);
    return { users: await listUsers() };
  });

export const adminListPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin, listPayments } = await import("./admin.server");
    await assertAdmin(context.userId);
    return listPayments();
  });

export const adminSetOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        audits: z.number().int().min(0).max(1_000_000).nullable(),
        mentions: z.number().int().min(0).max(1_000_000).nullable(),
        exports: z.boolean().nullable(),
        note: z.string().max(300).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context.userId);

    if (data.audits === null && data.mentions === null && data.exports === null) {
      await supabaseAdmin.from("plan_overrides").delete().eq("user_id", data.userId);
      return { ok: true, cleared: true };
    }

    const { error } = await supabaseAdmin.from("plan_overrides").upsert(
      {
        user_id: data.userId,
        audits: data.audits,
        mentions: data.mentions,
        exports: data.exports,
        note: data.note,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, cleared: false };
  });

export const adminResetUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("./admin.server");
    const { currentPeriod } = await import("./billing.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("usage_counters")
      .delete()
      .eq("user_id", data.userId)
      .eq("period", currentPeriod());
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), plan: z.enum(["free", "pro", "business"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: data.userId,
        plan: data.plan,
        status: data.plan === "free" ? "canceled" : "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
