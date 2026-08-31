import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Keyword research: Google autocomplete + AI-generated topics/questions. */
export const getKeywordResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ keyword: z.string().min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { researchKeyword } = await import("./research.server");
    const { withAiCredits } = await import("./billing.server");
    const { AI_COST } = await import("./plans");
    return await withAiCredits(context.userId, AI_COST.research, () =>
      researchKeyword(data.keyword.trim()),
    );
  });
