# Decision log

Append-only. Newest entry at the bottom. When a decision is reversed, add a new entry that references the old one; don't edit history.

Record anything a reviewer would ask "why?" about: library or provider choices, audio formats, thresholds, latency trade-offs, deviations from CLAUDE.md.

## Template

```md
## D-000: <short title>

- **Date:** YYYY-MM-DD
- **Phase:** <roadmap phase>
- **Status:** accepted | superseded by D-xxx | reverted

**Decision**
<One or two sentences: what we are doing.>

**Options considered**

1. <Option A>: <pros / cons>
2. <Option B>: <pros / cons>
3. <Option C>: <pros / cons>

**Why**
<The reasoning. Include measurements where they exist (latency numbers, cost, test results), and what would make us revisit this.>
```

---

<!-- Entries start below this line. -->

## D-001: Effect v4 instead of v3

- **Date:** 2026-10-17
- **Phase:** 0, Scaffold
- **Status:** accepted

**Decision**
Build on `effect@4.0.5` (with `@effect/platform-node`, `@effect/vitest` and later `@effect/sql-pg` on the same version), not Effect 3.

**Options considered**

1. **Effect 4.0.x**: current `latest` on npm and announced as an LTS line (at least 3 years of fixes). HTTP, SQL, RPC and Schema ship inside `effect` (`effect/http`, `effect/sql`), runtime overhead is lower, and the bundled `ai-docs` examples match the API. Cons: those modules are tagged `@stability unstable` and can break in minor releases; most blog posts, Stack Overflow answers and model training data describe v3 APIs.
2. **Effect 3.22.x**: more community material, stable `@effect/platform`. Cons: npm already tags it `prev`; a new project would start on a superseded major and face a migration later.

**Why**
A greenfield project should start on the supported major. The instability risk is contained by **exact pins** in the pnpm `catalog:` (all Effect packages on one version) and by upgrading deliberately, one PR at a time, with typecheck and tests as the gate. ESLint and `scripts/check-banned-deps.ts` block `@effect/platform`: its 0.x line still targets Effect 3 and would silently pull in a second runtime. v4 renames to keep in mind are listed in CLAUDE.md under "Effect 4 traps". Revisit only if a v4 bug blocks a phase with no workaround.

## D-002: TypeScript 6.0.3 instead of 7.0

- **Date:** 2026-10-17
- **Phase:** 0, Scaffold
- **Status:** accepted

**Decision**
Pin `typescript@6.0.3` for the whole workspace. TypeScript 7.0 (the native Go compiler) was the plan, but it breaks linting today.

**Options considered**

1. **TypeScript 7.0.2 everywhere**: roughly 10× faster typecheck, and Effect recommends it. Blocker: TS 7.0 has no stable programmatic API. `typescript-eslint@8.71.2` declares `peerDependencies.typescript: ">=4.8.4 <6.1.0"` and cannot run type-aware rules (which our "no `any`" convention relies on) on TS 7. Microsoft targets the API for 7.1.
2. **Split: TS 6 under the `typescript` name for tooling + TS 7 aliased for `tsc --noEmit`** (Microsoft's suggested migration path): fast typecheck now. Cons: two compilers can disagree on diagnostics, so CI could pass typecheck while lint's type info differs; more moving parts in a five-package repo where typecheck already takes seconds.
3. **TS 6.0.3 everywhere**: one compiler, full typescript-eslint support, meets Effect's ≥ 5.9 requirement. Vite (Rolldown/Oxc) and Node type stripping don't use tsc, so nothing else is affected.

**Why**
Option 3 keeps one source of truth for types and keeps the lint rules that enforce the no-`any` convention. Typecheck time is not a bottleneck at this size. Revisit when typescript-eslint supports the TypeScript 7.1 API: bump `typescript` in the catalog, run `pnpm typecheck && pnpm lint`, and supersede this entry.

## D-003: Groq as the LLM provider

- **Date:** 2026-10-17
- **Phase:** 0, Scaffold (affects Phase 3)
- **Status:** accepted

**Decision**
The default `Llm` Layer uses Groq (`groq-sdk`, streaming chat completions), configured by `GROQ_API_KEY`. The model is a Config value chosen in Phase 3.

**Options considered**

1. **Groq**: optimised for low time-to-first-token, which feeds directly into G1 (p50 < 800 ms end-of-speech → first audio). An API key already exists.
2. **Anthropic (Claude)**: strong quality; an earlier draft of CLAUDE.md defaulted to it. Would need a new key.
3. **Both behind `LLM_PROVIDER`**: proves the provider abstraction, at the cost of two Layers to maintain from day one.

**Why**
The owner chose Groq. The `Llm` service boundary stays provider-neutral, so adding a second Layer later (option 3) is a Layer swap, not a refactor. Benchmark TTFT per model in Phase 9 and record the model choice as its own entry.
