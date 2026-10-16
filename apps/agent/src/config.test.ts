import { assert, describe, it } from "@effect/vitest"
import { ConfigProvider, Effect, Redacted } from "effect"
import { AgentConfigError, loadAgentConfig } from "./config.ts"

const withEnv = (env: Record<string, string>) =>
  Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env }))

describe("loadAgentConfig", () => {
  it.effect("loads LiveKit settings and keeps the secret redacted", () =>
    Effect.gen(function* () {
      const config = yield* loadAgentConfig.pipe(
        withEnv({
          LIVEKIT_URL: "ws://localhost:7880",
          LIVEKIT_API_KEY: "devkey",
          LIVEKIT_API_SECRET: "super-secret",
        }),
      )
      assert.strictEqual(config.livekitUrl.href, "ws://localhost:7880/")
      assert.strictEqual(config.livekitApiKey, "devkey")
      assert.strictEqual(Redacted.value(config.livekitApiSecret), "super-secret")
      assert.notInclude(JSON.stringify(config), "super-secret")
    }),
  )

  it.effect("names every missing variable in one error", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(loadAgentConfig.pipe(withEnv({})))
      assert.instanceOf(error, AgentConfigError)
      assert.deepStrictEqual(error.missing, ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"])
      assert.include(error.message, "missing: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET")
      assert.include(error.message, ".env.example")
    }),
  )

  it.effect("reports a malformed value as invalid, not missing", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        loadAgentConfig.pipe(
          withEnv({ LIVEKIT_URL: "not a url", LIVEKIT_API_KEY: "devkey", LIVEKIT_API_SECRET: "s" }),
        ),
      )
      assert.deepStrictEqual(error.invalid, ["LIVEKIT_URL"])
      assert.deepStrictEqual(error.missing, [])
    }),
  )
})
