# ADR 0011 — Auth.js / JWT for MVP (SSO deferred)

- **Status:** Accepted
- **Date:** 2026-06-13
- **Related:** `requirement.md` §3.1, `intermediate-solution.md` §3.10

## Context

CodeSage needs self-hosted authentication and RBAC across four roles (admin, expert, developer,
end_user). Whether enterprise SSO (SAML/OIDC) is required at launch is an open question; the MVP
should not be blocked on it.

## Decision

Use **Auth.js / JWT** for the MVP — lightweight, fast to build, fully self-hosted. RBAC is
enforced in the Node API layer. **Keycloak** is the documented path for when enterprise SSO is
required.

## Consequences

- Quick to implement; no heavy identity service to operate for MVP.
- SSO/SAML/OIDC and advanced RBAC must be built later (or delegated to Keycloak).
- Tokens/secrets handled per the security model (encrypted at rest; see `final-solution.md` §10).

## Alternatives considered

- **Keycloak now:** full OIDC/SAML SSO + RBAC, on-prem — but heavier to run and unnecessary for
  an internal MVP. Deferred, not rejected.

## Escape hatch

Adopt **Keycloak** when SSO/enterprise RBAC becomes a requirement; the auth module in
`apps/api/modules/auth` isolates the provider so the switch is contained.
