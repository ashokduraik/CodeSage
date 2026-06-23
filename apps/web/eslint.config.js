import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { baseConfig } from "../../eslint.config.base.mjs";

/** ESLint flat config for the React frontend workspace. */
export default [
  { ignores: ["dist/**", "coverage/**", "node_modules/**"] },
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: ["src/shared/ui/**", "src/test/**"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["src/features/**/*Context.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
];
