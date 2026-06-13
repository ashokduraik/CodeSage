# ADR 0007 — tree-sitter for AST parsing

- **Status:** Accepted
- **Date:** 2026-06-13
- **Related:** `intermediate-solution.md` §3.2, `final-solution.md` §6

## Context

CodeSage must parse source into an AST-level representation to build the code graph and
AST-aware chunks. First targets are MEAN/MERN (JS/TS), and the system must be extensible to
more languages (NFR-8). It also needs to parse Angular templates, which hold permission-gated
UI and routing.

## Decision

Use **tree-sitter** as the universal parsing backbone (MIT, fast, incremental, 40+ grammars,
one consistent API). Ship grammars in two layers:

- **Layer A (code knowledge):** `tree-sitter-javascript` (incl. JSX), `tree-sitter-typescript`
  (`typescript` + `tsx`) — functions, API calls, routes, logic.
- **Layer B (product knowledge):** `tree-sitter-html`, `tree-sitter-css`/`scss`, and
  `tree-sitter-angular` for Angular template microsyntax (`*ngIf`, `{{ }}`, `[prop]`,
  `(event)`).

Mixed-language files use tree-sitter **language injections**; JSX/TSX parses natively.

## Consequences

- One consistent parsing API across languages; incremental re-parsing fits the freshness model.
- Per-language grammar setup required; tree-sitter is not full semantic analysis.
- Pluggable grammar registry makes adding languages cheap (NFR-8).

## Alternatives considered

- **Language-native parsers** (javaparser, Roslyn, Python `ast`): deepest accuracy but N
  toolchains and high maintenance. Rejected.
- **LSP servers:** rich symbol data but heavy at batch scale; designed for editors. Rejected.

## Escape hatch

Optionally add a **TS-native enricher** (TypeScript compiler API via a Python-invoked sidecar)
later for deeper type/symbol resolution to strengthen cross-repo API linking.
