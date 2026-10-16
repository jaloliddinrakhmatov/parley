import { useQuery } from "@tanstack/react-query"
import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router"
import { Effect } from "effect"
import { fetchHealth } from "./health.ts"

function HealthStatus() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => Effect.runPromise(fetchHealth((input) => fetch(input, { signal }))),
    refetchInterval: 5_000,
    retry: false,
  })

  if (health.isPending) return <p>API: checking…</p>
  if (health.isError) return <p role="alert">API: unreachable</p>
  return <p>API: {health.data.status}</p>
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <main>
      <h1>Parley</h1>
      <HealthStatus />
    </main>
  ),
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute]),
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
