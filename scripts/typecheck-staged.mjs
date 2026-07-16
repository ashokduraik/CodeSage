#!/usr/bin/env node
// Runs workspace typecheck only when staged files touch that workspace.
// Codegen check runs only when contracts/ are staged.
//
// Usage:
//   node scripts/typecheck-staged.mjs
import { getStagedFiles } from "./lib/staged-files.mjs";
import { runTypecheckStaged } from "./lib/run-staged-checks.mjs";

process.exit(runTypecheckStaged(getStagedFiles()));
