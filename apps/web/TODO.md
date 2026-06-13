# apps/web — TODO

Component checklist, organized by feature. Check items as they land. (Global sequencing lives in
`docs/final-solution.md` §12.)

## Foundation
- [ ] Choose build tool + package manager (record ADR if non-obvious).
- [x] App shell: routing, providers, layout (React Query `QueryClientProvider` + i18next `initReactI18next` wired in `main.tsx`).
- [ ] Auth-aware navigation + login screen (against Node Auth.js/JWT).
- [x] Typed API client scaffold generated from `contracts/` (`getHealth` uses `NodeApi.components['schemas']['HealthResponse']`; `NodePaths` exported from generated types).
- [ ] WebSocket client utility for streamed responses.

## Projects feature
- [ ] Create project form.
- [ ] Attach repo(s): URL + token + branch + role (`frontend`/`backend`/`iam`).
- [ ] Multi-repo management UI for a project.
- [ ] Index/job status display per repo.

## Chat feature
- [ ] Conversation list + message thread.
- [ ] WebSocket streaming of answers.
- [ ] Citation rendering (code refs + expert-verified KB).
- [ ] Audience toggle (developer vs end-user).
- [ ] Page-context capture for page-scoped product questions.
- [ ] "Unknown / not certain" answer state.

## Expert-queue feature
- [ ] Question queue list with context references.
- [ ] Answer submission form.
- [ ] Reflect override status after answering.

## Explorer feature
- [ ] Workflows browser (steps + confidence + sources).
- [ ] Page map browser (route → components → data sources).
- [ ] Permission map browser.
- [ ] Data-flow / freshness browser.

## Cross-cutting
- [ ] Loading / error / empty states across features.
- [ ] Accessibility pass.
- [ ] Colocated tests for each feature.
- [ ] Typecheck + lint clean in CI.
