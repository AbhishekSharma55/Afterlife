# AI provider and model switch

Scenes and episode recaps share one server-side configuration. The example environment now selects OpenRouter with `deepseek/deepseek-v4-flash`. Add your key to the ignored root `.env` and restart the backend:

```dotenv
AI_PROVIDER=openrouter
AI_MODEL=deepseek/deepseek-v4-flash
OPENROUTER_API_KEY=YOUR_KEY
```

For direct OpenAI evaluation, change the provider and model and supply the corresponding key:

```dotenv
AI_PROVIDER=openai
AI_MODEL=YOUR_OPENAI_MODEL_ID
OPENAI_API_KEY=YOUR_KEY
```

Use an actual model ID enabled for your project; the model must support strict structured output. To use an OpenAI model through OpenRouter instead, leave `AI_PROVIDER=openrouter` and set `AI_MODEL` to its OpenRouter model ID. Restart after each configuration change. Compose reads the same variables from `.env.compose.local`; update that ignored file if using Compose.

The application selects a fixed Responses API endpoint per provider and uses only that provider's key. It never substitutes the other provider's key or silently changes models. Unsupported `AI_PROVIDER` values fail startup before database allocation. When the provider is omitted, existing deployments default to direct OpenAI; `OPENAI_MODEL` remains a legacy fallback only when direct OpenAI is selected and `AI_MODEL` is empty.

Both providers receive `store: false` and the existing strict JSON schemas. OpenRouter requests require parameter-compatible endpoints and disable reasoning for these short narrative tasks to preserve the output/time budget. Returned data still passes the same schema, event/action ID, and contribution validation. Missing selected-provider configuration, failed requests, refusals, incomplete responses, or invalid output use factual narration. Missing credentials do not establish live model access; verify the UI's narration status before claiming generated prose.

On October 31, 2026, OpenRouter's public model catalog listed `deepseek/deepseek-v4-flash` with `structured_outputs`, `response_format`, and reasoning support. Actual authenticated generation has not yet been tested; the user will supply the key separately. Existing request/output limits and timeouts remain in force.

Sources: [OpenRouter Responses API](https://openrouter.ai/docs/api_reference/responses/overview), [structured outputs and routing](https://openrouter.ai/docs/guides/features/structured-outputs), [reasoning controls](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens), [selected model](https://openrouter.ai/deepseek/deepseek-v4-flash), [official OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
