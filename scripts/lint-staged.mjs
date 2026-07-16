#!/usr/bin/env node
// Runs ESLint with --fix only on staged files per npm workspace.
//
// Usage:
//   node scripts/lint-staged.mjs
import { getStagedFiles } from "./lib/staged-files.mjs";
import { runLintStaged } from "./lib/run-staged-checks.mjs";

process.exit(runLintStaged(getStagedFiles()));
