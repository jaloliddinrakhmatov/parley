// @ts-check
import js from "@eslint/js"
import prettier from "eslint-config-prettier"
import reactHooks from "eslint-plugin-react-hooks"
import { defineConfig, globalIgnores } from "eslint/config"
import globals from "globals"
import tseslint from "typescript-eslint"
import { bannedLivekitReactHooks, bannedPackagePrefixes, bannedPackages } from "./scripts/banned.ts"

const constraint = "See CLAUDE.md, 'The constraint'."

export default defineConfig(
  globalIgnores(["**/node_modules/", "**/dist/", "**/coverage/", "**/*.tsbuildinfo"]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": true, "ts-nocheck": true, "ts-expect-error": "allow-with-description" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      // Effect.gen bodies legitimately `return yield*` errors and never-returning effects.
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],

      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...bannedPackages.map(({ name, reason }) => ({ name, message: `${reason} ${constraint}` })),
            {
              name: "@livekit/components-react",
              importNames: [...bannedLivekitReactHooks],
              message: `Agent-aware hooks are banned; Parley's pipeline is custom. ${constraint}`,
            },
          ],
          patterns: [
            {
              group: [
                ...bannedPackages.map(({ name }) => `${name}/*`),
                ...bannedPackagePrefixes.map((prefix) => `${prefix}*`),
              ],
              message: `Banned package. ${constraint}`,
            },
          ],
        },
      ],
    },
  },

  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    extends: [reactHooks.configs.flat["recommended-latest"]],
  },

  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  prettier,
)
