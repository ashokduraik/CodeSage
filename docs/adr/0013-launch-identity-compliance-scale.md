# ADR 0013 — Launch posture: identity (SSO), compliance, and user scale

- **Status:** Accepted
- **Date:** 2026-06-13
- **Related:** `requirement.md` §6 (open questions 3, 4, 5), ADR 0011

## Context

Three open questions from `requirement.md` §6 remained before implementation: **(3)** concurrent
user scale, **(4)** whether SSO (SAML/OIDC) is required at launch, **(5)** data-residency /
compliance standards. The product owner directed: don't worry about user scale; for SSO timing
and compliance, **use the recommended posture**.

## Decision

Adopt the recommended, MVP-appropriate posture and treat these questions as **resolved for the
first release**:

- **Identity / SSO (Q4):** **No SSO at launch.** Use **Auth.js / JWT** with app-level RBAC
  (ADR 0011). **Keycloak** (self-hosted OIDC/SAML) is the documented upgrade path when enterprise
  SSO becomes a requirement. No launch work is blocked on SSO.
- **Compliance / data residency (Q5):** **No specific external certification** (SOC2/ISO/etc.)
  targeted for the first release. Rely on the platform's built-in security posture, which already
  satisfies the spirit of common controls: **self-hosted / on-prem only** (no code leaves the
  network), **encrypted repo tokens at rest**, **least-privilege read-only tokens**, **RBAC**, and
  **audit logging** (see `final-solution.md` §10). Formal certification is deferred and revisited
  only if internal policy requires it.
- **User scale (Q3):** **Not a design constraint for MVP.** Assume **low, internal concurrency**;
  a single 48 GB GPU suffices (ADR 0009). The container-first design (ADR 0012) allows scaling out
  (more GPUs / Kubernetes) later without re-architecture if concurrency grows.

## Consequences

- Implementation can proceed without waiting on identity/compliance/scale answers.
- Security controls (encryption, least-privilege, RBAC, audit) are **in scope for MVP** because
  they are the substitute for formal certification — they are not optional.
- SSO and formal compliance are explicit, low-friction future upgrades, not rewrites.

## Alternatives considered

- **Keycloak + formal compliance program at launch:** higher assurance but heavier and
  unnecessary for an internal MVP; rejected per the recommended posture. Deferred, not closed.

## Escape hatch

Revisit when: an enterprise customer/policy requires SSO (→ adopt Keycloak), a certification is
mandated (→ start the relevant control program), or QA concurrency rises materially (→ scale GPU /
move to Kubernetes per ADR 0012).
