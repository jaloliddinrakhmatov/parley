import { assert, describe, it } from "@effect/vitest"
import { Effect, Result } from "effect"
import { decodeHealthResponse } from "./health.ts"

describe("HealthResponse", () => {
  it.effect("decodes a healthy response", () =>
    Effect.gen(function* () {
      const health = yield* decodeHealthResponse({ status: "ok" })
      assert.deepStrictEqual(health, { status: "ok" })
    }),
  )

  it.effect("rejects any other status", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(decodeHealthResponse({ status: "down" }))
      assert.isTrue(Result.isFailure(result))
    }),
  )
})
