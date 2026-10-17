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
- Canvas imports must not invent missing data; study-plan model calls remain in Django.
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

### documentation — 14 files (0 test-like)
Paths: `AGENTS.md` … `frontend/README.md`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `FR_TRACEABILITY.md`
- `README.md`
- `docs/A2_SECURITY_GAP_ANALYSIS.md`
- `docs/FRONTEND_ARCHITECTURE.md`
- `docs/PLANNER_IMPLEMENTATION_REPORT.md`
- `docs/developer_setup_guide.md`
- `docs/production_setup_guide.md`
- `docs/scheduler.md`
- `docs/scheduler_contract.md`
- `docs/timeline_contract.md`
- `docs/timelineview.md`
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

### frontend:pages — 8 files (1 test-like)
Paths: `frontend/src/pages/ConnectionStatus.jsx` … `frontend/src/pages/student/StudentRegisterPage.jsx`
- `frontend/src/pages/ConnectionStatus.jsx`
- `frontend/src/pages/admin/AdminDashboardPage.jsx`
- `frontend/src/pages/admin/AdminLoginPage.jsx`
- `frontend/src/pages/admin/AdminUsersPage.jsx`
- `frontend/src/pages/student/SettingsPage.jsx`
- `frontend/src/pages/student/SettingsPage.timezone.test.jsx`
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
- `docs/scheduler_contract.md`, `docs/timeline_contract.md`: contract boundaries.
- `docs/FRONTEND_ARCHITECTURE.md`: MVP Figma source, UI naming and ownership.
- `docs/PLANNER_IMPLEMENTATION_REPORT.md`: historical implementation notes, verify against code.
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
  `docs/implementation/ARC_DEVELOPMENT_WORKFLOW.md`.
- Verification: 209 frontend unit tests passed, 2 skipped;
  167 Node tests passed, 2 skipped; production build passed.
- Human HA-01–HA-04 acceptance: 17 October 2026.
- Existing indexed metadata is preserved for unchanged files.
  New entries are minimally indexed, not fully symbol-extracted.
- Separate technical debt: sortable Planner `<ul>` contains
  non-`<li>` row wrappers. No HA1 drag-and-drop refactor.
- All work remains uncommitted.
