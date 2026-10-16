import { Config, Effect, Option, type Redacted, Result, Schema } from "effect"

export interface AgentConfig {
  readonly livekitUrl: URL
  readonly livekitApiKey: string
  readonly livekitApiSecret: Redacted.Redacted
}

export class AgentConfigError extends Schema.TaggedError<AgentConfigError>()("AgentConfigError", {
  missing: Schema.Array(Schema.String),
  invalid: Schema.Array(Schema.String),
}) {
  override get message(): string {
    const problems = [
      ...(this.missing.length > 0 ? [`missing: ${this.missing.join(", ")}`] : []),
      ...(this.invalid.length > 0 ? [`invalid: ${this.invalid.join(", ")}`] : []),
    ]
    return `Agent configuration error (${problems.join("; ")}). Copy .env.example to .env and set these variables.`
  }
}

/** Load one variable: `None` when absent, a failure when present but invalid. */
const optional = <A>(name: string, config: Config.Config<A>) =>
  Config.option(config).pipe(
    Effect.result,
    Effect.map((result) => ({ name, result })),
  )

/**
 * Loads every variable the agent needs and reports *all* problems at once,
 * so a fresh checkout fails with one actionable message instead of one per run.
 */
export const loadAgentConfig: Effect.Effect<AgentConfig, AgentConfigError> = Effect.gen(function* () {
  const [url, apiKey, apiSecret] = yield* Effect.all([
    optional("LIVEKIT_URL", Config.URL("LIVEKIT_URL")),
    optional("LIVEKIT_API_KEY", Config.NonEmptyString("LIVEKIT_API_KEY")),
    optional("LIVEKIT_API_SECRET", Config.Redacted("LIVEKIT_API_SECRET")),
  ])

  const missing: Array<string> = []
  const invalid: Array<string> = []
  const value = <A>(entry: { name: string; result: Result.Result<Option.Option<A>, Config.ConfigError> }) => {
    if (Result.isFailure(entry.result)) {
      invalid.push(entry.name)
      return Option.none<A>()
    }
    if (Option.isNone(entry.result.success)) missing.push(entry.name)
    return entry.result.success
  }

  const livekitUrl = value(url)
  const livekitApiKey = value(apiKey)
  const livekitApiSecret = value(apiSecret)

  if (Option.isSome(livekitUrl) && Option.isSome(livekitApiKey) && Option.isSome(livekitApiSecret)) {
    return {
      livekitUrl: livekitUrl.value,
      livekitApiKey: livekitApiKey.value,
      livekitApiSecret: livekitApiSecret.value,
    }
  }
  return yield* new AgentConfigError({ missing, invalid })
})
