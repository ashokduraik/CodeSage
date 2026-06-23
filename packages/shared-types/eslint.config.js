import { baseConfig } from "../../eslint.config.base.mjs";

/** ESLint flat config for generated shared types (hand-edits forbidden). */
export default [
  { ignores: ["dist/**", "node_modules/**", "src/generated/**"] },
  ...baseConfig,
];
