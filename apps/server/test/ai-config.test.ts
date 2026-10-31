import test from "node:test";
import assert from "node:assert/strict";
import { narratorOptionsFromEnv } from "../src/runtime/ai-config.js";
import {
  generateNarration,
  generateRecap,
  type NarratorContext,
} from "../src/integrations/narrator.js";

const context: NarratorContext = {
  facts: {},
  events: [],
  eligibleEncounterIds: ["treaty"],
  actions: [{ id: "hold", label: "Hold" }],
  fallbackTitle: "Council",
  fallbackNarration: "The council waits.",
};
const narration = {
  sceneTitle: "Council",
  narration: "The council waits.",
  leaderReactions: [],
  referencedEventIds: [],
  eligibleEncounterId: "treaty",
  choiceLabels: [{ actionId: "hold", label: "Hold" }],
};
const recapContext = {
  facts: {},
  previousEvents: [],
  offlineEvents: [],
  contributions: [],
  fallbackPreviously: "A new world.",
  fallbackWhileAway: "No developments.",
};
const recap = {
  previously: "A new world.",
  whileAway: "No developments.",
  referencedEventIds: [],
  contributionRefs: [],
};
const output = (value: unknown) =>
  Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(value) }],
      },
    ],
  });

test("provider selection keeps keys separate and supports unified/legacy OpenAI models", () => {
  const env = {
    OPENAI_API_KEY: "direct-test",
    OPENROUTER_API_KEY: "router-test",
    OPENAI_MODEL: "legacy-direct",
  };
  assert.deepEqual(narratorOptionsFromEnv(env), {
    provider: "openai",
    apiKey: "direct-test",
    model: "legacy-direct",
  });
  assert.deepEqual(
    narratorOptionsFromEnv({
      ...env,
      AI_PROVIDER: "openrouter",
      AI_MODEL: "deepseek/deepseek-v4-flash",
    }),
    {
      provider: "openrouter",
      apiKey: "router-test",
      model: "deepseek/deepseek-v4-flash",
    },
  );
  assert.equal(
    narratorOptionsFromEnv({
      ...env,
      AI_PROVIDER: "openai",
      AI_MODEL: "evaluation-model",
    }).model,
    "evaluation-model",
  );
  assert.equal(
    narratorOptionsFromEnv({
      OPENAI_API_KEY: "must-not-leak",
      OPENAI_MODEL: "must-not-inherit",
      AI_PROVIDER: "openrouter",
    }).apiKey,
    undefined,
  );
  assert.equal(
    narratorOptionsFromEnv({
      OPENAI_MODEL: "must-not-inherit",
      AI_PROVIDER: "openrouter",
    }).model,
    undefined,
  );
  assert.throws(
    () => narratorOptionsFromEnv({ AI_PROVIDER: "typo" }),
    /AI_PROVIDER/,
  );
});

for (const provider of ["openai", "openrouter"] as const) {
  test(`${provider} routes scenes and recaps through the selected endpoint with strict grounded output`, async () => {
    const requests: any[] = [];
    const options = {
      ...narratorOptionsFromEnv({
        AI_PROVIDER: provider,
        AI_MODEL: "chosen-model",
        OPENAI_API_KEY: "direct-test",
        OPENROUTER_API_KEY: "router-test",
      }),
      request: (async (url, init) => {
        requests.push({
          url,
          headers: init?.headers,
          body: JSON.parse(String(init?.body)),
        });
        return output(requests.length === 1 ? narration : recap);
      }) as typeof fetch,
    };
    assert.equal(
      (await generateNarration(context, options)).status,
      "generated",
    );
    assert.equal(
      (await generateRecap(recapContext, options)).status,
      "generated",
    );
    for (const request of requests) {
      assert.equal(
        request.url,
        provider === "openrouter"
          ? "https://openrouter.ai/api/v1/responses"
          : "https://api.openai.com/v1/responses",
      );
      assert.equal(
        request.headers.Authorization,
        `Bearer ${provider === "openrouter" ? "router-test" : "direct-test"}`,
      );
      assert.equal(request.body.model, "chosen-model");
      assert.equal(request.body.store, false);
      assert.equal(request.body.text.format.strict, true);
      assert.deepEqual(
        request.body.provider,
        provider === "openrouter" ? { require_parameters: true } : undefined,
      );
      assert.deepEqual(
        request.body.reasoning,
        provider === "openrouter" ? { enabled: false } : undefined,
      );
    }
  });
}

test("missing selected-provider key makes no request and invalid OpenRouter output falls back", async () => {
  const missing = narratorOptionsFromEnv({
    AI_PROVIDER: "openrouter",
    AI_MODEL: "router-model",
    OPENAI_API_KEY: "unrelated-test",
  });
  let calls = 0;
  const request = (async () => {
    calls++;
    throw new Error("Must not request without selected key");
  }) as typeof fetch;
  assert.equal(
    (await generateNarration(context, { ...missing, request })).status,
    "fallback",
  );
  assert.equal(
    (await generateRecap(recapContext, { ...missing, request })).status,
    "fallback",
  );
  assert.equal(calls, 0);
  const options = {
    provider: "openrouter" as const,
    apiKey: "test",
    model: "router-model",
    request: (async () =>
      output({
        ...narration,
        referencedEventIds: ["invented"],
      })) as typeof fetch,
  };
  assert.equal((await generateNarration(context, options)).status, "fallback");
  assert.equal(
    (
      await generateRecap(recapContext, {
        ...options,
        request: (async () =>
          new Response("unavailable", { status: 503 })) as typeof fetch,
      })
    ).status,
    "fallback",
  );
});
