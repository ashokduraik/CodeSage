import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Shared TypeScript ESLint rules for all JS workspaces.
 * Import from per-app `eslint.config.js` files (api, web, shared-types).
 */
export const baseConfig = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);

export default baseConfig;
