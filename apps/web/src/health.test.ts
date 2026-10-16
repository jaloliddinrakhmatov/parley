import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { fetchHealth, HealthInvalid, HealthUnreachable } from "./health.ts"

const respond =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }))

describe("fetchHealth", () => {
  it.effect("decodes a healthy API response", () =>
    Effect.gen(function* () {
      const health = yield* fetchHealth(respond({ status: "ok" }))
      assert.deepStrictEqual(health, { status: "ok" })
    }),
  )

  it.effect("fails with HealthInvalid when the body does not match the schema", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(fetchHealth(respond({ status: "down" })))
      assert.instanceOf(error, HealthInvalid)
    }),
  )

  it.effect("fails with HealthUnreachable on a non-2xx status or network error", () =>
    Effect.gen(function* () {
      const http = yield* Effect.flip(fetchHealth(respond({}, 502)))
      assert.instanceOf(http, HealthUnreachable)

      const network = yield* Effect.flip(fetchHealth(() => Promise.reject(new TypeError("fetch failed"))))
      assert.instanceOf(network, HealthUnreachable)
    }),
  )
})
