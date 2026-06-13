# CodeSage — Requirements Document

> **Status:** Draft v0.1
> **Owner:** _TBD_
> **Last updated:** 2026-06-13

---

## 1. Overview

**CodeSage** is a self-hosted, codebase-aware QA (question-answering) platform. An
organization connects its source repositories (GitLab / GitHub) to CodeSage. CodeSage
indexes the code, continuously keeps the index fresh, uses an LLM to **understand the
system and derive its business/user workflows**, and then answers questions through a
chat interface — for **both developers and end-users**.

When CodeSage is uncertain about how something works, it **asks clarifying questions** to
the domain experts who onboarded the project. Their answers become authoritative
knowledge that improves all future answers.

A **project is not necessarily a single repository**. A microservice-based system maps to
**one project composed of multiple repositories** (e.g. `frontend`, `backend`, `iam`).
CodeSage must index all repos of a project and understand how they interact (e.g. the
frontend calling the backend API, the backend calling IAM).

### 1.1 Problem statement

Large codebases (target scale: **~3 million lines of code**, potentially split across
multiple repositories per project) are hard to understand. The
knowledge needed to answer questions — both "how does the code work?" and "how do I use
this product / what permission do I need / when will my data appear?" — is scattered
across code, configuration, and people's heads. CodeSage centralizes that knowledge and
makes it queryable.

### 1.2 Goals

- Connect repositories via URL + access token and index them automatically.
- Keep the index continuously fresh (detect updates, re-index incrementally).
- Use an LLM to understand functionality and **derive business/user workflows** from code.
- Answer **developer** questions (architecture, logic, where things live).
- Answer **end-user** questions (navigation, required permissions, data timing/freshness).
- Let CodeSage raise clarifying questions; let experts answer them; fold answers back in.
- Run **fully self-hosted / on-prem** so private source code never leaves the network.

### 1.3 Non-goals (for now)

- Not an IDE coding assistant / autocomplete tool.
- Not an automated PR-review or bug-finding tool.
- Not a general-purpose document/wiki host.
- Not a public multi-tenant SaaS (deployment is single-organization, self-hosted).

---

## 2. Users & roles

| Role | Description | Key actions |
|---|---|---|
| **Admin** | Sets up CodeSage, manages users, configures LLM/infra. | Manage org, users, integrations, quotas. |
| **Expert / Project Owner** | Adds a project (repo), curates knowledge, answers clarifying questions. | Create project, supply repo URL + token, answer the question queue, override/verify derived facts. |
| **Developer (end user)** | Asks code-level questions. | Ask code Q&A, browse workflows, view citations. |
| **Product End-User (end user)** | Asks product/usage questions about the analyzed app. | Ask "how to navigate this page", "what permission is needed", "when will data appear". |

> The "end user" is **both** a developer asking about code **and** a user of the analyzed
> application asking how to use it.

---

## 3. Functional requirements

### 3.1 Authentication & project setup
- **FR-1** Users can log in (self-hosted auth; SSO optional later).
- **FR-2** An Expert can create a **project** and attach **one or more repositories**
  (GitLab/GitHub URL + access token each), supporting **microservice/multi-repo** systems
  (e.g. `frontend`, `backend`, `iam`).
- **FR-3** Tokens are stored **encrypted at rest**; least-privilege (read-only) tokens are
  recommended and documented.
- **FR-4** Each repository in a project can specify branch(es) to index.
- **FR-4a** CodeSage understands and links **cross-repository interactions** within a project
  (e.g. frontend → backend API → IAM) so workflows can span repos.

### 3.2 Indexing
- **FR-5** On project creation, CodeSage clones **every repository** in the project and
  performs a **full initial index**.
- **FR-6** CodeSage parses source into an **AST-level representation** and builds:
  - a **per-project code graph** (files, classes, functions, calls, imports, callers)
    that spans **all repos** of the project, including cross-repo edges, and
  - a **vector index** (semantic, AST-aware chunks).
- **FR-7** Indexing must scale to **~3M LOC** per project (aggregated across its repos).

### 3.3 Continuous freshness
- **FR-8** CodeSage detects updates for **each repository** in a project via **webhook**
  (push events) **and** a **scheduled poll** fallback.
- **FR-9** Updates trigger **incremental re-indexing** (only changed files + affected graph
  nodes, including affected cross-repo edges), not a full re-index.
- **FR-10** The system tracks the last-indexed commit SHA **per repository/branch**.

### 3.4 Understanding & workflow derivation
- **FR-11** Using the LLM + code graph, CodeSage derives **business/user workflows**
  (e.g. "login flow", "checkout flow") and links each to the underlying code path.
- **FR-12** CodeSage builds a **page/route map** of the application's screens/endpoints.
- **FR-13** CodeSage builds a **permission/RBAC map** (per page/action: required permission).
- **FR-14** CodeSage builds a **data-flow/freshness map** (per page: where data comes from,
  sync vs async, cached, polled, event-driven).
- **FR-15** Every derived fact carries a **confidence score** and **source citations**
  (file + line).

### 3.5 Expert-in-the-loop clarification
- **FR-16** When derived knowledge is low-confidence or contradictory, CodeSage creates a
  **clarifying question** attached to the relevant code location.
- **FR-17** Experts see a **question queue** and can answer N questions.
- **FR-18** Expert answers are stored as **authoritative overrides** (higher trust than
  inferred facts) and reused on future re-indexes (no duplicate questions).

### 3.6 QA serving (LLM + RAG)
- **FR-19** A **chat/QA interface** answers questions grounded in retrieved context.
- **FR-20** A **question router** classifies each question as **code** (→ vector + graph) or
  **product/usage** (→ structured knowledge base) and retrieves accordingly.
- **FR-21** End-user product questions can be **page-scoped** (the user's current page/route
  is passed as context).
- **FR-22** Answers include **citations** (to code or to expert-verified knowledge).
- **FR-23** If the answer is not supported by retrieved context, CodeSage says so and may
  raise a new expert question instead of hallucinating.

---

## 4. Non-functional requirements

| ID | Requirement |
|---|---|
| **NFR-1 Deployment** | Self-hostable, container-based. Topology (Docker Compose vs Kubernetes; on-prem vs hosted) is **not finalized** — decided later by service count, complexity, and Docker support. Keeping private code/tokens internal remains a design goal. |
| **NFR-2 Security** | Encrypted token vault, least-privilege repo access, audit logging. |
| **NFR-3 Scale** | Handle ~3M LOC per project; multiple projects per org. |
| **NFR-4 Performance** | Interactive QA latency target: first token in a few seconds. |
| **NFR-5 Freshness** | Re-index changes within minutes of a push (webhook-driven). |
| **NFR-6 Reliability** | Indexing is async, queued, resumable; partial failures isolated per file. |
| **NFR-7 Trust** | Every answer is grounded + cited; confidence visible for derived facts. |
| **NFR-8 Extensibility** | New languages addable via pluggable parsers. |
| **NFR-9 Observability** | Job status, index health, query logs, cost/usage metrics. |
| **NFR-10 Open source only** | All adopted technologies must be open source / free to self-host. **No paid products or commercial-only services.** |
| **NFR-11 Multi-repo** | A project may contain multiple repositories or Monorepo; indexing, graph, and workflows operate at the project level across all its repos. |

---

## 5. Scope assumptions & constraints

- **Web stack is fixed:** **React.js** (frontend) + **Node.js** for **all non-blocking
  APIs** — serving React static files, user creation, login/auth, project & repo creation,
  and similar CRUD. **All heavy/blocking work** (repo sync, parsing, indexing, LLM
  understanding/distillation, RAG/QA) is **Python**. Remaining technology choices are
  evaluated in `intermediate-solution.md`.
- **Open source only:** no paid products/services may be used (NFR-10).
- **First target codebases are MEAN and MERN stacks** — i.e. MongoDB, Express, Angular/React,
  Node.js (JavaScript/TypeScript). Parsing/understanding is prioritized for these.
- **Projects can be microservice/multi-repo** (e.g. `frontend`, `backend`, `iam`).
- Deployment is **single-organization, self-hosted**.
- The analyzed app's permission/data-timing knowledge is only as reliable as the
  distillation + expert corrections; CodeSage shows confidence and citations to manage trust.

---

## 6. Open questions (to finalize before solution design)

1. **LLM hosting constraint** — Open source only (no paid APIs). Confirm available **GPU
   hardware** for self-hosted inference (sizes which open model fits).
1a. **Deployment topology** — Docker Compose vs Kubernetes, and on-prem vs hosted. To be
   finalized later based on number of services, complexity, and Docker support.
2. ~~Primary languages/frameworks~~ — **Resolved:** first targets are **MEAN/MERN**
   (MongoDB, Express, Angular/React, Node.js — JS/TS). Other languages may come later.
3. **User scale** — how many concurrent developers/end-users will query CodeSage?
4. **Identity** — is SSO (SAML/OIDC) required at launch or later?
5. **Data residency / compliance** — any specific standards (SOC2, ISO, internal policy)?

---

## 7. Success criteria (MVP)

- An expert can connect one repo and get it fully indexed.
- A developer can ask a code question and receive a correct, cited answer.
- The system re-indexes automatically on push.
- At least one derived workflow + one page permission record is queryable.
- The expert question queue works end-to-end (raise → answer → reused in answers).
