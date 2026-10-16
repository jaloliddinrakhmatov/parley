import { decodeHealthResponse, type HealthResponse } from "@parley/shared"
import { Effect, Schema } from "effect"

export class HealthUnreachable extends Schema.TaggedError<HealthUnreachable>()("HealthUnreachable", {
  reason: Schema.String,
}) {}

export class HealthInvalid extends Schema.TaggedError<HealthInvalid>()("HealthInvalid", {
  reason: Schema.String,
}) {}

type Fetch = (input: string) => Promise<Response>

/** GET /api/health (proxied to the API by Vite in dev) and decode it with the shared schema. */
export const fetchHealth = (
  fetchImpl: Fetch = (input) => fetch(input),
): Effect.Effect<HealthResponse, HealthUnreachable | HealthInvalid> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetchImpl("/api/health"),
      catch: (cause) => new HealthUnreachable({ reason: String(cause) }),
    })
    if (!response.ok) {
      return yield* new HealthUnreachable({ reason: `HTTP ${String(response.status)}` })
    }
    const body = yield* Effect.tryPromise({
      try: (): Promise<unknown> => response.json(),
      catch: (cause) => new HealthInvalid({ reason: String(cause) }),
    })
    return yield* decodeHealthResponse(body).pipe(
      Effect.mapError((error) => new HealthInvalid({ reason: error.message })),
    )
  })
