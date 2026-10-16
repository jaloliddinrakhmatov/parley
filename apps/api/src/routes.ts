import { HealthResponse } from "@parley/shared"
import { Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"

const healthJson = HttpServerResponse.schemaJson(HealthResponse)

export const HealthRoute = HttpRouter.add("GET", "/health", healthJson({ status: "ok" }))

export const Routes = Layer.mergeAll(HealthRoute)
