import type { NarratorOptions } from "../integrations/narrator.js";

/** Provider keys stay separate so switching cannot send a key to the wrong service. */
export function narratorOptionsFromEnv(
  env: NodeJS.ProcessEnv,
): NarratorOptions {
  const provider = env.AI_PROVIDER?.trim() || "openai";
  if (provider !== "openai" && provider !== "openrouter")
    throw new Error("AI_PROVIDER must be openai or openrouter.");
  return {
    provider,
    apiKey:
      provider === "openrouter" ? env.OPENROUTER_API_KEY : env.OPENAI_API_KEY,
    model:
      env.AI_MODEL?.trim() ||
      (provider === "openai" ? env.OPENAI_MODEL?.trim() : undefined),
  };
}
