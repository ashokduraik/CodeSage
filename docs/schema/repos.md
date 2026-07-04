# `repos`

> **Status:** implemented  
> **Domain:** Identity & projects

Git repositories attached to a project. Stores encrypted access tokens, webhook config, and sync/indexing metadata.

## Columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `project_id` | `uuid` | NO | — | FK → `projects.id`; owning project |
| `repo_url` | `text` | NO | — | Clone/fetch URL |
| `provider` | `repo_provider` | NO | — | Git host: `github` or `gitlab` |
| `branch` | `text` | NO | `'main'` | Default branch to sync |
| `token_enc` | `bytea` | YES | — | App-level encrypted deploy/read token |
| `last_indexed_sha` | `text` | YES | — | Git commit SHA of the last successful index |
| `created_at` | `timestamptz` | NO | `now()` | Attach time (UTC) |
| `full_name` | `text` | YES | — | Provider slug, e.g. `org/repo` |
| `description` | `text` | YES | — | Repo description from provider at attach |
| `base_url` | `text` | YES | — | Self-hosted GitLab API base URL when applicable |
| `is_private` | `boolean` | NO | `false` | Whether the repo is private on the provider |
| `connection_status` | `text` | NO | `'connecting'` | Connect health: `connecting`, `connected`, `error` |
| `last_error` | `text` | YES | — | Most recent connection/sync error message |
| `last_error_at` | `timestamptz` | YES | — | When `last_error` was recorded (UTC) |
| `webhook_id` | `text` | YES | — | Provider webhook ID after registration |
| `webhook_secret_enc` | `bytea` | YES | — | Encrypted webhook signing secret |
| `webhook_enabled` | `boolean` | NO | `false` | Whether push webhooks are active |
| `last_indexed_at` | `timestamptz` | YES | — | When git sync last succeeded (UTC) |
| `primary_language` | `text` | YES | — | Dominant language from provider at attach |
| `updated_at` | `timestamptz` | NO | `now()` | Last row update (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who attached the repo |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted (detach) |

## Constraints

- `status` must be `A` or `D` (`repos_status_check`).

## Indexes

| Name | Columns | Notes |
|---|---|---|
| `idx_repos_project_id` | `project_id` | All repos for a project |
| `idx_repos_active_project` | `project_id` | Partial: `WHERE status = 'A'` — list active repos |

## Foreign keys

| Column | References | On delete |
|---|---|---|
| `project_id` | `projects(id)` | `CASCADE` |
| `created_by` | `users(id)` | (no action) |
| `updated_by` | `users(id)` | (no action) |
