import globals from "globals";
import { baseConfig } from "../../eslint.config.base.mjs";

/** ESLint flat config for the Node API workspace. */
export default [
  { ignores: ["dist/**", "coverage/**", "node_modules/**"] },
  ...baseConfig,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
];
