/**
 * Fails if any workspace package.json lists a banned package, even if nothing imports it yet.
 * Run with `node scripts/check-banned-deps.ts` (part of `pnpm lint`).
 */
import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { isBannedPackage } from "./banned.ts"

const root = join(import.meta.dirname, "..")
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const

const manifests = [
  join(root, "package.json"),
  ...["apps", "packages"].flatMap((dir) =>
    existsSync(join(root, dir))
      ? readdirSync(join(root, dir), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => join(root, dir, entry.name, "package.json"))
          .filter((path) => existsSync(path))
      : [],
  ),
]

const violations: Array<string> = []
for (const manifest of manifests) {
  const json: unknown = JSON.parse(readFileSync(manifest, "utf8"))
  if (typeof json !== "object" || json === null) continue
  for (const field of dependencyFields) {
    const deps: unknown = Reflect.get(json, field)
    if (typeof deps !== "object" || deps === null) continue
    for (const name of Object.keys(deps)) {
      if (isBannedPackage(name)) violations.push(`${manifest.slice(root.length + 1)} → ${field}.${name}`)
    }
  }
}

if (violations.length > 0) {
  console.error("Banned packages found (see CLAUDE.md, The constraint):")
  for (const violation of violations) console.error(`  ${violation}`)
  process.exit(1)
}
console.log(`check-banned-deps: ${String(manifests.length)} manifests clean`)
