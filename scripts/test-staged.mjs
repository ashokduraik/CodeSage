#!/usr/bin/env node
// Runs colocated / directly staged tests only (no coverage gate).
//
// Usage:
//   node scripts/test-staged.mjs
import { getStagedFiles } from "./lib/staged-files.mjs";
import { runTestStaged } from "./lib/run-staged-checks.mjs";

process.exit(runTestStaged(getStagedFiles()));
