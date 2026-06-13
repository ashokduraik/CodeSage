# db/seed/ — Dev seed data & fixtures

> **Status:** Empty placeholder. Seed scripts/fixtures land alongside Phase 0.

## Rules

- **Dev/test only.** Never put production or real customer data here.
- **No real secrets** — use obviously-fake tokens/credentials.
- Seed should create a minimal usable state: an admin + expert user, one project, one repo
  (pointing at a small sample), so the app is demoable end-to-end.
- Keep seed idempotent (safe to re-run) where practical.
