import { NodeRuntime } from "@effect/platform-node"
import { HealthResponse } from "@parley/shared"
import { Effect, Schema } from "effect"
import { loadAgentConfig } from "./config.ts"

const encodeHealth = Schema.encodeEffect(HealthResponse)

const program = Effect.gen(function* () {
  const config = yield* loadAgentConfig
  const health = yield* encodeHealth({ status: "ok" })

  yield* Effect.logInfo("agent ready").pipe(
    Effect.annotateLogs({
      livekitUrl: config.livekitUrl.href,
      health: health.status,
    }),
  )

  // Phase 1 replaces this with joining rooms; for now the worker idles until SIGINT/SIGTERM.
  return yield* Effect.never
}).pipe(Effect.tapError((error) => Effect.logError(error.message)))

NodeRuntime.runMain(program, { disableErrorReporting: true })
