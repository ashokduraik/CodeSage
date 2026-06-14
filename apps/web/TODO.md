# apps/web — TODO

Component checklist, organized by feature. Check items as they land. (Global sequencing lives in
`docs/final-solution.md` §12.)

## Foundation
- [ ] Choose build tool + package manager (record ADR if non-obvious).
- [x] App shell: routing (`react-router-dom`), providers, layout (`AppLayout` + `Sidebar` + `MobileNav`); React Query `QueryClientProvider` + i18next wired in `main.tsx`.
- [x] Tailwind CSS + design-token theme (`src/index.css`); vendored UI primitives in `src/shared/ui/`.
- [x] Auth-aware navigation + login screen — `AuthContext`/`useAuth` (JWT, localStorage), `LoginPage`, `ProtectedRoute` guard; `AuthProvider` wraps the app in `main.tsx`.
- [x] Typed API client — `shared/lib/apiClient.ts` (`apiFetch` typed against `@codesage/shared-types`; Authorization header injection).
- [ ] Replace `src/shared/mock/` with the real typed API client (chat/dashboard still mock-backed).
- [ ] WebSocket client utility for streamed responses.

## Dashboard feature
- [x] Overview stat cards (projects, sessions, knowledge, reviews).
- [x] Recent projects list with status badges; recent conversations list.
- [x] Loading / error / empty states; colocated tests.

## Projects feature
- [x] Create project form (`CreateProjectDialog` + `useCreateProject`).
- [x] Attach repo(s): URL + token + branch + role — `AttachRepoDialog` + `useAttachRepo` (enqueues sync job on attach).
- [ ] Multi-repo management UI for a project (per-repo list + status).
- [ ] Index/job status display per repo.

## Chat feature
- [x] Conversation list + message thread (mock-backed).
- [x] New-conversation dialog with audience toggle (developer vs end-user) + project scope.
- [x] Citation rendering (source chips) + low-confidence "sent for expert review" state.
- [ ] WebSocket streaming of answers (currently a mock React Query mutation).
- [ ] Citation rendering against real code refs + expert-verified KB.
- [ ] Page-context capture for page-scoped product questions.

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
