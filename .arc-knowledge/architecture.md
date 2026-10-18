# ARC architecture working map

This is a **navigation aid**, not a replacement for `ARCHITECTURE.md`, `FR_TRACEABILITY.md`, or source code.

## Runtime topology

React 19/Vite SPA → API wrappers (`frontend/src/api/`) → TanStack Query hooks (`frontend/src/hooks/`) → Django REST endpoints (`backend/*/urls.py`, `views.py`) → serializers, planning services, models → PostgreSQL.

The planning scheduler adapter (`backend/planning/services/scheduler_v1.py`) bridges ARC planning state to external `arc-scheduler` pinned in `backend/requirements.txt`. The authoritative scheduler implementation is outside this snapshot.

## Feature ownership

- Authentication/MFA and tenant ownership: `backend/accounts/`, `backend/core/`, `frontend/src/stores/authStore.js`, `frontend/src/components/*Route.jsx`, `frontend/src/pages/student/*`.
- Planning hierarchy, lifecycle, priority, dependencies, progress, deletion, overdue, focus, scheduling: `backend/planning/`, `frontend/src/features/planner/`, `frontend/src/features/focus/`, `frontend/src/features/timeline/`, and corresponding hooks/DnD modules.
- Password change and admin-approved reset: `backend/accounts/password_reset.py`, `frontend/src/pages/student/ForgotPasswordPage.jsx`, and the staff Overview queue.
- Canvas import: `backend/canvas_integration/`, `frontend/src/api/canvas.js`, `frontend/src/hooks/useCanvas.js`.
- Admin/analytics: `backend/analytics/`, `frontend/src/pages/admin/`, `frontend/src/components/admin/`.

## Constraints to preserve

- Cross-tenant access must never leak user data.
- Backend owns business rules; frontend does not invent them.
- No invented Canvas deadlines, marks, or course weights.
- Study-plan LLM keys and calls remain server-side.
- Preserve planning contract tests and scheduling invariants.
- `docs/FRONTEND_ARCHITECTURE.md` specifies `MVP arc` Figma page, not `ARC FULL`, as UI source of truth.

## Evidence and limitations

This map is based on the supplied repository snapshot and existing project documentation. Import edges in `repo_map.json` are static heuristics; runtime behavior and tests have not been independently executed in this inspection.
