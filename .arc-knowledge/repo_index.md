# ARC repository navigation index

Snapshot: `feature/arc-next-development` at `6b9b99b01c0f18856f01c894996b6d8c6e3959be`; V3 #23/HA1 accepted working tree, not yet committed. See incremental addendum below.
Generated from 358 source/config/docs files; not a test run. Read exact source before edits.

## How to use
1. Locate a feature below. Search `.arc-knowledge/repo_map.json` for precise file paths, symbols, local JS imports, and hashes.
2. Read only relevant source, API boundary, domain services, and related tests.
3. After changes, update affected map entries and this index, then validate.
4. Do not assume `role_hint` is an authoritative behavioral specification; it is a static filename/comment hint.

## Architectural guardrails
- `AGENTS.md` is the existing team rulebook; preserve it.
- `ARCHITECTURE.md` and `FR_TRACEABILITY.md` explain established decisions and assignment requirements.
- Django/DRF/Postgres backend is authoritative for domain invariants, isolation, and scheduling.
- React SPA uses TanStack Query, Zustand auth, API wrappers and hooks.
- Canvas imports must not invent missing data. Password change and reset approval stay in Django.
- Scheduler is an external commit-pinned package; inspect its contract before changing adapter.

## Entry points and cross-cutting flows
- Backend: `backend/arc_backend/settings.py`, `backend/arc_backend/urls.py`; `backend/{accounts,planning,canvas_integration,analytics}/urls.py`.
- Planning domain: `backend/planning/models.py`, `views.py`, `serializers.py`, `queries.py`, `services/*.py`.
- Overdue presentation: `backend/planning/services/overdue.py` derives deadline and active/expired-anchor buckets without persisting an overdue flag; serializers expose those derived states to Planner and Timeline.
- Scheduler bridge: `backend/planning/services/scheduler_v1.py`; scheduling service, sticky-anchor and adapter tests.
- Frontend bootstrap/routes: `frontend/src/main.jsx`, `App.jsx`; API `frontend/src/api/*`; hooks `frontend/src/hooks/*`.
- Planner: `frontend/src/features/planner/*` and `frontend/src/dnd/planner/*`.
- Timeline: `frontend/src/features/timeline/*`, `frontend/src/dnd/timeline/*`; current uncommitted edits in `Timeline.css`, `TimelineSidebar.jsx`.
- Focus: `frontend/src/features/focus/*`, `frontend/src/dnd/focus/*`.
- Regression: `backend/planning/tests/contract/*`, `backend/planning/tests/*`, frontend `*.test.*`, `tests/runners/*`.

## Incremental V3 addendum — active task work

- Planner task hover controls now open a confirmation-only dependency dialog. Its clicked task remains in slot one; reversing changes only the prerequisite/dependent mapping and reuses the existing dependent-scoped prerequisites API.
- The task editor exposes a read-only dependency-DAG viewer only for connected tasks. It uses the user-scoped `items/{id}/dependency_graph/` bulk component response, keeping hierarchy out of dependency traversal.
- Dependency-DAG cards use parent-derived ancestry and a bounded hover/focus expansion beneath the compact card; the layout uses a 44px horizontal gap without description reservation, and explicit SVG polygon arrow tips align to destination card top boundaries.
- Child due-date inheritance is now an explicit backend fact: `PlanningItem.due_date_inherited` and migration `0021` distinguish following a parent deadline from an explicit child date/clear. Propagation is implemented in `planning.services.domain_commands` and is covered by `test_task_editor.py`.
- Planner creation/editing invokes the established `/priority/reorder/` command only for an explicitly changed, valid priority position after the ordinary item mutation; the item API continues to reject direct `priority_position` writes.
- Planner task forms use a clamped numeric priority position sourced from the current priority order; untouched priorities and inherited due dates stay omitted so Django retains their provenance.
- Planner deadline markers are filled gold indicators positioned on each overdue task's own indentation rail, including nested rows.
- Timeline Today-card detail visibility is hover/focus driven like every other date. Planner uses its existing derived `deadline_overdue` fact for a non-interactive card marker.
- `StudentLayout` owns the multi-origin radial page background; its fixed header is transparent so the navbar retains background continuity.

## Incremental update — public FAQ (2026-10-19)

- `/faq` is public. The sign-in page and the student menu both link to it. `/` is the landing page. Marks stays a page at `/marks`, and the menu lists it beside FAQ.
- The page explains student pages and walks through creating a University of Sydney Canvas personal access token, then links to Canvas account settings and to `/settings?tab=integration`.

## Incremental update — password reset, study plan removed (2026-10-18)

- Signed-in password change: `POST /api/auth/password/change/`. Locked-out reset is requested, approved on `GET /api/admin/password-resets/`, then confirmed by the same browser. The admin payload does not include the student token.
- Study-plan UI, API, service, and model client are removed. `SchedulingState.study_plan` stays unused.

## Incremental update — PR freeze verification (2026-10-18)

- `dependency_graph` returns `""` for nullable persisted descriptions, matching
  the graph UI's string contract while keeping the model nullable.
- Detail lookups eager-load the owner for the existing `IsOwner` backstop, so
  the dependency graph remains tenant-isolated within its four-query budget.
- Timeline anchor-conflict regression expectations derive from their current
  date fixture rather than a stale literal calendar date.

## Area inventory

### backend:accounts — 21 files (5 test-like)
Paths: `backend/accounts/__init__.py` … `backend/accounts/views.py`
- backend/accounts/* (11)
- backend/accounts/migrations/* (5)
- backend/accounts/tests/* (5)

### backend:analytics — 11 files (2 test-like)
Paths: `backend/analytics/__init__.py` … `backend/analytics/views.py`
- `backend/analytics/__init__.py`
- `backend/analytics/admin.py`
- `backend/analytics/apps.py`
- `backend/analytics/migrations/__init__.py`
- `backend/analytics/models.py`
- `backend/analytics/serializers.py`
- `backend/analytics/tests.py`
- `backend/analytics/tests/__init__.py`
- `backend/analytics/tests/test_api.py`
- `backend/analytics/urls.py`
- `backend/analytics/views.py`

### backend:arc_backend — 5 files (0 test-like)
Paths: `backend/arc_backend/__init__.py` … `backend/arc_backend/wsgi.py`
- `backend/arc_backend/__init__.py`
- `backend/arc_backend/asgi.py`
- `backend/arc_backend/settings.py`
- `backend/arc_backend/urls.py`
- `backend/arc_backend/wsgi.py`

### backend:canvas_integration — 15 files (2 test-like)
Paths: `backend/canvas_integration/__init__.py` … `backend/canvas_integration/views.py`
- `backend/canvas_integration/__init__.py`
- `backend/canvas_integration/admin.py`
- `backend/canvas_integration/apps.py`
- `backend/canvas_integration/client.py`
- `backend/canvas_integration/migrations/0001_initial.py`
- `backend/canvas_integration/migrations/0002_canvasconnection_sync_course_ids.py`
- `backend/canvas_integration/migrations/__init__.py`
- `backend/canvas_integration/models.py`
- `backend/canvas_integration/serializers.py`
- `backend/canvas_integration/sync.py`
- `backend/canvas_integration/tests.py`
- `backend/canvas_integration/tests/__init__.py`
- `backend/canvas_integration/tests/test_api.py`
- `backend/canvas_integration/urls.py`
- `backend/canvas_integration/views.py`

### backend:conftest.py — 1 files (0 test-like)
Paths: `backend/conftest.py`
- `backend/conftest.py`

### backend:core — 19 files (2 test-like)
Paths: `backend/core/__init__.py` … `backend/core/views.py`
- backend/core/* (13)
- backend/core/management/* (1)
- backend/core/management/commands/* (2)
- backend/core/migrations/* (1)
- backend/core/tests/* (2)

### backend:manage.py — 1 files (0 test-like)
Paths: `backend/manage.py`
- `backend/manage.py`

### backend:planning — 105 files (57 test-like)
Paths: `backend/planning/__init__.py` … `backend/planning/views.py`
- backend/planning/* (9)
- backend/planning/migrations/* (21)
- backend/planning/services/* (18)
- backend/planning/tests/* (32)
- backend/planning/tests/contract/* (25)

### backend:pytest.ini — 1 files (0 test-like)
Paths: `backend/pytest.ini`
- `backend/pytest.ini`

### backend:requirements.txt — 1 files (0 test-like)
Paths: `backend/requirements.txt`
- `backend/requirements.txt`

### backend:tests — 1 files (1 test-like)
Paths: `backend/tests/e2e/seed_focus_browser.py`
- `backend/tests/e2e/seed_focus_browser.py`

### configuration — 11 files (1 test-like)
Paths: `.gitignore` … `frontend/vitest.config.js`
- `.gitignore`
- `Makefile`
- `frontend/.gitignore`
- `frontend/.oxlintrc.json`
- `frontend/e2e/focus-known-failures.spec.js`
- `frontend/e2e/run-focus-backend.sh`
- `frontend/index.html`
- `frontend/package.json`
- `frontend/playwright.config.js`
- `frontend/vite.config.js`
- `frontend/vitest.config.js`

### dnd:core — 2 files (0 test-like)
Paths: `frontend/src/dnd/core/modifiers.js` … `frontend/src/dnd/core/useSortableSensors.js`
- `frontend/src/dnd/core/modifiers.js`
- `frontend/src/dnd/core/useSortableSensors.js`

### dnd:focus — 2 files (1 test-like)
Paths: `frontend/src/dnd/focus/focusProjection.js` … `frontend/src/dnd/focus/focusProjection.test.js`
- `frontend/src/dnd/focus/focusProjection.js`
- `frontend/src/dnd/focus/focusProjection.test.js`

### dnd:planner — 9 files (4 test-like)
Paths: `frontend/src/dnd/planner/PlannerDnd.jsx` … `frontend/src/dnd/planner/plannerVisualPlacement.test.js`
- `frontend/src/dnd/planner/PlannerDnd.jsx`
- `frontend/src/dnd/planner/PlannerSidebarDnd.jsx`
- `frontend/src/dnd/planner/plannerDragScenario.test.js`
- `frontend/src/dnd/planner/plannerProjection.js`
- `frontend/src/dnd/planner/plannerProjection.test.js`
- `frontend/src/dnd/planner/plannerSidebarProjection.js`
- `frontend/src/dnd/planner/plannerSidebarProjection.test.js`
- `frontend/src/dnd/planner/plannerVisualPlacement.js`
- `frontend/src/dnd/planner/plannerVisualPlacement.test.js`

### dnd:priority — 3 files (1 test-like)
Paths: `frontend/src/dnd/priority/PriorityDnd.jsx` … `frontend/src/dnd/priority/priorityProjection.test.js`
- `frontend/src/dnd/priority/PriorityDnd.jsx`
- `frontend/src/dnd/priority/priorityProjection.js`
- `frontend/src/dnd/priority/priorityProjection.test.js`

### dnd:timeline — 3 files (1 test-like)
Paths: `frontend/src/dnd/timeline/timelineDragPayload.js` … `frontend/src/dnd/timeline/timelineProjection.test.js`
- `frontend/src/dnd/timeline/timelineDragPayload.js`
- `frontend/src/dnd/timeline/timelineProjection.js`
- `frontend/src/dnd/timeline/timelineProjection.test.js`

### documentation
Paths: `AGENTS.md` … `frontend/README.md`. Start at `docs/README.md`.
- `AGENTS.md`
- `ARCHITECTURE.md`
- `FR_TRACEABILITY.md`
- `README.md`
- `docs/README.md`
- `docs/architecture/frontend.md`
- `docs/contracts/scheduler.md`
- `docs/contracts/timeline.md`
- `docs/governance/constitution.md`
- `docs/governance/workflow.md`
- `docs/guides/scheduler.md`
- `docs/guides/timeline.md`
- `docs/security/a2-gap-analysis.md`
- `docs/setup/developer.md`
- `docs/setup/production.md`
- `docs/reviews/ARC_PR_DESCRIPTION.md`
- `docs/reviews/ARC_PR_FREEZE_REVIEW.md`
- `docs/reviews/ARC_V3_SIX_TASKS_REPORT.md`
- `docs/reviews/PLANNER_IMPLEMENTATION_REPORT.md`
- `docs/reviews/password-reset-and-study-plan-removal.md`
- `frontend/README.md`

### frontend:App.css — 1 files (0 test-like)
Paths: `frontend/src/App.css`
- `frontend/src/App.css`

### frontend:App.jsx — 1 files (0 test-like)
Paths: `frontend/src/App.jsx`
- `frontend/src/App.jsx`

### frontend:api — 4 files (0 test-like)
Paths: `frontend/src/api/admin.js` … `frontend/src/api/planning.js`
- `frontend/src/api/admin.js`
- `frontend/src/api/auth.js`
- `frontend/src/api/canvas.js`
- `frontend/src/api/planning.js`

### frontend:components — 12 files (1 test-like)
Paths: `frontend/src/components/AdminRoute.jsx` … `frontend/src/components/student/ViewToggle.jsx`
- `frontend/src/components/AdminRoute.jsx`
- `frontend/src/components/SessionHydrator.jsx`
- `frontend/src/components/SessionHydrator.test.jsx`
- `frontend/src/components/StudentRoute.jsx`
- `frontend/src/components/admin/AdminLayout.jsx`
- `frontend/src/components/student/EditablePosition.jsx`
- `frontend/src/components/student/HamburgerButton.jsx`
- `frontend/src/components/student/NavigationDrawer.jsx`
- `frontend/src/components/student/StudentLayout.css`
- `frontend/src/components/student/StudentLayout.jsx`
- `frontend/src/components/student/StudentViewNav.jsx`
- `frontend/src/components/student/ViewToggle.jsx`

### frontend:focus — 16 files (4 test-like)
Paths: `frontend/src/features/focus/Focus.css` … `frontend/src/features/focus/useFocusFind.js`
- frontend/src/features/focus/* (16)

### frontend:hooks — 16 files (2 test-like)
Paths: `frontend/src/hooks/useAdmin.js` … `frontend/src/hooks/useTimelineUniverse.js`
- frontend/src/hooks/* (16)

### frontend:index.css — 1 files (0 test-like)
Paths: `frontend/src/index.css`
- `frontend/src/index.css`

### frontend:lib — 14 files (5 test-like)
Paths: `frontend/src/lib/apiClient.js` … `frontend/src/lib/totp.js`
- `frontend/src/lib/apiClient.js`
- `frontend/src/lib/calendarDates.js`
- `frontend/src/lib/calendarDates.test.js`
- `frontend/src/lib/errors.js`
- `frontend/src/lib/latestIntentQueue.js`
- `frontend/src/lib/latestIntentQueue.test.js`
- `frontend/src/lib/plainText.js`
- `frontend/src/lib/plainText.test.js`
- `frontend/src/lib/planningOptimistic.js`
- `frontend/src/lib/planningOptimistic.test.js`
- `frontend/src/lib/queryClient.js`
- `frontend/src/lib/subjectLabel.js`
- `frontend/src/lib/subjectLabel.test.js`
- `frontend/src/lib/totp.js`

### frontend:main.jsx — 1 files (0 test-like)
Paths: `frontend/src/main.jsx`
- `frontend/src/main.jsx`

### frontend:pages — 11 files (3 test-like)
Paths: `frontend/src/pages/ConnectionStatus.jsx` … `frontend/src/pages/student/StudentRegisterPage.jsx`
- `frontend/src/pages/ConnectionStatus.jsx`
- `frontend/src/pages/student/FaqPage.jsx`
- `frontend/src/pages/student/FaqPage.test.jsx`
- `frontend/src/pages/admin/AdminDashboardPage.jsx`
- `frontend/src/pages/admin/AdminLoginPage.jsx`
- `frontend/src/pages/admin/AdminUsersPage.jsx`
- `frontend/src/pages/student/SettingsPage.jsx`
- `frontend/src/pages/student/SettingsPage.timezone.test.jsx`
- `frontend/src/pages/student/StudentAuthForms.test.jsx`
- `frontend/src/pages/student/StudentLoginPage.jsx`
- `frontend/src/pages/student/StudentRegisterPage.jsx`

### frontend:planner — 21 files (6 test-like)
Paths: `frontend/src/features/planner/PlannerPage.jsx` … `frontend/src/features/planner/studyPlanConflicts.test.js`
- frontend/src/features/planner/* (6)
- frontend/src/features/planner/components/* (14)
- frontend/src/features/planner/hooks/* (1)

### frontend:shared — 3 files (0 test-like)
Paths: `frontend/src/shared/search/SearchToolbar.jsx` … `frontend/src/shared/search/useSearchNavigation.js`
- `frontend/src/shared/search/SearchToolbar.jsx`
- `frontend/src/shared/search/planningSearchText.js`
- `frontend/src/shared/search/useSearchNavigation.js`

### frontend:stores — 1 files (0 test-like)
Paths: `frontend/src/stores/authStore.js`
- `frontend/src/stores/authStore.js`

### frontend:styles — 1 files (0 test-like)
Paths: `frontend/src/styles/theme.css`
- `frontend/src/styles/theme.css`

### frontend:timeline — 29 files (5 test-like)
Paths: `frontend/src/features/timeline/AnchorDialog.jsx` … `frontend/src/features/timeline/useTimelinePreferences.js`
- frontend/src/features/timeline/* (29)

### verification — 6 files (6 test-like)
Paths: `tests/README.md` … `tests/runners/reporting.py`
- `tests/README.md`
- `tests/contracts/regression_matrix.md`
- `tests/runners/discovery_guard.py`
- `tests/runners/postgres_preflight.py`
- `tests/runners/regression.sh`
- `tests/runners/reporting.py`

## Existing reference documents
- `docs/README.md`: which document to read, and which ones stay separate.
- `docs/contracts/scheduler.md`, `docs/contracts/timeline.md`: contract boundaries.
- `docs/guides/scheduler.md`, `docs/guides/timeline.md`: current implementation, not normative.
- `docs/architecture/frontend.md`: MVP Figma source, UI naming and ownership.
- `docs/governance/constitution.md`: product and domain draft. `docs/governance/workflow.md`: process.
- `docs/reviews/PLANNER_IMPLEMENTATION_REPORT.md`: historical implementation notes, verify against code.
- `tests/contracts/regression_matrix.md`: regression expectations.

## Index freshness
Run `.arc-knowledge/validate_index.py` after each Codex task. Changed file hashes require incremental reindexing, not blind acceptance. New/deleted files require map edits.


## V3 #23 / HA1 incremental reconciliation — 17 October 2026

- Backend scheduling and overdue behavior:
  `backend/planning/services/scheduling.py` and related
  planning models, API and regression tests.
- Planner navigation:
  `PlannerPage.jsx`, `PlannerSidebar.jsx`, `PlannerTree.jsx`.
- Timeline markers and overdue presentation:
  `timelineDates.js`, `TimelineCard.jsx`, `Timeline.css`.
- HA1 navigation integration regression:
  `PlannerPage.overdueNavigation.test.jsx`.
- Development authority:
  `docs/governance/workflow.md`.
- Verification: 209 frontend unit tests passed, 2 skipped;
  167 Node tests passed, 2 skipped; production build passed.
- Human HA-01–HA-04 acceptance: 17 October 2026.
- Existing indexed metadata is preserved for unchanged files.
  New entries are minimally indexed, not fully symbol-extracted.
- Separate technical debt: sortable Planner `<ul>` contains
  non-`<li>` row wrappers. No HA1 drag-and-drop refactor.
- All work remains uncommitted.

## V3 UI and Focus description reconciliation — 17 October 2026

- Planner: nested creation regression tests use the task-card entry point.
- Planner: Roots scrolling and full-width task-list scrolling verified.
- Timeline: root navigation, overdue filters, sticky header, and CSS tests.
- Timeline overdue classification helpers and tests indexed.
- Focus: Show more / Show less descriptions implemented and tested.
- Vitest: Focus description regression tests registered.
- Frontend verification: 223 passed, 2 skipped.
- Node verification: 167 passed, 2 skipped.
- Production build and browser verification passed.
- Repository index reconciled against inspected working-tree files.
- No application code changed by this reconciliation.

## V3 #13 — Planner tag management

- `CreatePlanningItemPanel.jsx` owns inline tag rename and global delete confirmation.
- Existing `planning/tags/` PATCH and DELETE API functions are reused.
- Tag selection remains independent of management controls.
- Tag mutations invalidate planning-tag and planning query caches.
- `CreatePlanningItemPanel.test.jsx` covers rename, deletion, cancellation, and failures.


### V3 #13 — Selected tag chips
- Selected tags render inside the Tags input as removable chips.
- Each chip's × unselects the tag locally; it does not delete the global tag.
- The text input remains available for tag entry and creation.
- The tag list retains single-click selection, double-click renaming, and confirmed global deletion.

## Incremental update — Shared calendar (2026-10-17)

- `frontend/src/components/ArcDateCalendar.jsx`: shared date grid, month selector,
  editable year, Today navigation and current-date highlighting.
- `frontend/src/components/ArcDateField.jsx` and `.css`: reusable form date field
  and popup, used by task, timezone and anchor forms.
- `frontend/src/components/ArcDateCalendar.test.jsx`: four interaction tests.
- `frontend/src/features/timeline/TimelineToolbar.jsx`: uses the shared calendar.
- `frontend/src/features/timeline/TimelineWorkflows.test.jsx`: updated heading assertions.
- `frontend/vitest.config.js`: registers the new calendar test.
- The eight modified files were indexed at their current working-tree hashes.
  Their hashes do not imply that all their changes belong to the calendar checkpoint.
- Automated verification: 237 passed, 2 skipped; production build passed.
- Browser verification passed; calendar checkpoint committed locally as `03c334c` on `feature/arc-next-development`.

## Incremental update — Dependency DAG viewer (2026-10-18)

- `DependencyGraphModal.jsx` is a portaled, viewport-centered, resizable read-only,
  top-to-bottom layered DAG. It persists validated dimensions locally, clamps them to
  the viewport, retains intrinsic scroll dimensions, SVG arrows behind HTML task cards,
  and empty-space drag panning.
- `DependencyGraphModal.test.jsx` covers layout, portal positioning, resize persistence,
  viewport constraints, graph interactions, modal lifecycle, and malformed cyclic data;
  Vitest registers the focused test.

## Incremental update — documentation layout (2026-10-18)

- Living map: `docs/README.md`.
- Setup procedures are unified in `docs/setup/developer.md`. Clean-clone validation stays in `docs/setup/production.md`.
- Frozen contracts are `docs/contracts/scheduler.md` and `docs/contracts/timeline.md`. Implementation guides are `docs/guides/scheduler.md` and `docs/guides/timeline.md`.
- Product draft and process stay separate: `docs/governance/constitution.md`, `docs/governance/workflow.md`.
- A2 evidence is `docs/security/a2-gap-analysis.md`. Historical audits and the shipped password-reset note are under `docs/reviews/`.
- `SchedulingState.study_plan` remains unused. Priority is the `/priority` route of `PlannerPage`.

## Incremental update — signup authenticator code (2026-10-20)

- Signup still enrols an authenticator and asks for a six-digit code. It no longer renders the live current code on that step.
- `StudentAuthForms.test.jsx` covers that the authenticator step does not show "Current code".
