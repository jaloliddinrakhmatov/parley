/**
 * Packages Parley must never depend on or import. See "The constraint" in CLAUDE.md.
 * Shared by eslint.config.js (imports) and scripts/check-banned-deps.ts (package.json).
 */
export const bannedPackages: ReadonlyArray<{ readonly name: string; readonly reason: string }> = [
  {
    name: "@effect/platform",
    reason: "Effect v4 merged it into `effect`: import from `effect/http`, `effect/sql` instead (D-001).",
  },
  {
    name: "@livekit/agents",
    reason: "LiveKit is transport only; the voice pipeline is ours (CLAUDE.md, The constraint).",
  },
]

/** Prefixes: any package starting with one of these is banned too (e.g. @livekit/agents-plugin-silero). */
export const bannedPackagePrefixes: ReadonlyArray<string> = ["@livekit/agents-"]

/** Agent-aware hooks that would smuggle LiveKit's agent pipeline into the browser. */
export const bannedLivekitReactHooks: ReadonlyArray<string> = [
  "useVoiceAssistant",
  "useAgent",
  "useVoiceAssistantContext",
]

export const isBannedPackage = (name: string): boolean =>
  bannedPackages.some((banned) => banned.name === name) ||
  bannedPackagePrefixes.some((prefix) => name.startsWith(prefix))
