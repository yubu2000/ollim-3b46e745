import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Keyword research: Google autocomplete + AI-generated topics/questions. */
export const getKeywordResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ keyword: z.string().min(1).max(100) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { researchKeyword } = await import("./research.server");
    return await researchKeyword(data.keyword.trim());
  });
