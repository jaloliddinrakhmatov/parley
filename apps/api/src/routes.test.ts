import { assert, describe, it } from "@effect/vitest"
import { decodeHealthResponse } from "@parley/shared"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { Routes } from "./routes.ts"

describe("GET /health", () => {
  it.effect("responds 200 with a body matching the shared HealthResponse schema", () =>
    Effect.acquireRelease(
      Effect.sync(() => HttpRouter.toWebHandler(Routes.pipe(Layer.provide(HttpServer.layerServices)))),
      ({ dispose }) => Effect.promise(() => dispose()),
    ).pipe(
      Effect.flatMap(({ handler }) =>
        Effect.gen(function* () {
          const response = yield* Effect.promise(() => handler(new Request("http://localhost/health")))
          assert.strictEqual(response.status, 200)

          const body: unknown = yield* Effect.promise(() => response.json())
          const health = yield* decodeHealthResponse(body)
          assert.deepStrictEqual(health, { status: "ok" })
        }),
      ),
      Effect.scoped,
    ),
  )
})
