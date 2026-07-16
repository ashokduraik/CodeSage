#!/usr/bin/env node
// Single-process pre-commit gate. Skips JS lint/typecheck/vitest and codegen
// unless staged files actually touch them (avoids triple `npm run` startup cost).
//
// Usage:
//   node scripts/pre-commit.mjs
import { runPreCommit } from "./lib/run-staged-checks.mjs";

process.exit(runPreCommit());
