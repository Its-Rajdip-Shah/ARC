# ARC V3 six active tasks report

Historical snapshot from before those tasks landed on the planning branch. The dirty-work notes at the end describe that working tree, not the current one.

## 1. Timeline Today cards — IMPLEMENTED

Changed: `frontend/src/features/timeline/Timeline.css`, `frontend/src/features/timeline/TimelineWorkflows.test.jsx`.

Today no longer forces card details open. Cards expand through the existing hover-intent and focus behavior. Focused Timeline tests passed.

## 2. Planner priority in forms — IMPLEMENTED

Changed: `frontend/src/features/planner/components/CreatePlanningItemPanel.jsx`, `frontend/src/features/planner/PlannerPage.jsx`, `frontend/src/features/planner/components/CreatePlanningItemPanel.test.jsx`.

The form offers global priority positions and persists an explicit selection through the existing priority reorder API after create/update. It does not write `priority_position` through the item API. Form regression tests passed.

## 3. Planner overdue indicators — IMPLEMENTED

Changed: `frontend/src/features/planner/components/PlannerTreeItem.jsx`, `frontend/src/features/planner/PlannerPage.overdueNavigation.test.jsx`.

Incomplete cards with the backend-derived `deadline_overdue` flag get a small, pointer-inert red marker at their left vertical centre. Completed cards do not. Planner regression tests passed; DnD code was not changed.

## 4. Inherited due dates — IMPLEMENTED

Changed: `backend/planning/models.py`, `backend/planning/migrations/0021_planningitem_due_date_inherited.py`, `backend/planning/services/domain_commands.py`, `backend/planning/serializers.py`, `backend/planning/services/history.py`, `backend/planning/tests/test_task_editor.py`.

New child omissions are persisted as inherited facts, parent changes/removals propagate through inherited descendants, and explicit child dates/clears stop propagation. Existing records remain explicit because their historical intent cannot be safely inferred. Migration was created but not applied. Backend pytest could not run: Django is unavailable in the workspace. Changed Python modules compile successfully.

## 5. Smooth multi-origin background — IMPLEMENTED

Changed: `frontend/src/components/student/StudentLayout.jsx`.

The page retains radial gradients with five low-contrast, broad origins to reduce visible banding. Automated build passed. Visual acceptance remains pending.

## 6. Navbar background continuity — IMPLEMENTED

Changed: `frontend/src/components/student/StudentLayout.jsx`.

The fixed header is transparent so the shared page background continues beneath it. Navigation behavior was not changed. Automated build passed. Visual acceptance remains pending.

## Verification

- Focused frontend: 109 passed, 1 skipped.
- Frontend unit suite: 245 passed, 2 skipped.
- Frontend node/DnD suite: 167 passed, 2 skipped.
- Production build: passed.
- Backend inheritance pytest: not runnable (`ModuleNotFoundError: django`); no dependencies were installed. Python syntax compilation passed.
- `git diff --check`: reports pre-existing trailing whitespace in `docs/implementation/ARC.md`; no task-specific whitespace issue was reported.

## Browser acceptance checklist

- Confirm Today Timeline cards are collapsed initially and expand on hover/focus.
- Create and edit tasks at first, middle, and last priority positions.
- Confirm red Planner markers on incomplete overdue cards only; exercise click and drag.
- Create nested undated children; change and clear parent deadlines; set/clear child dates.
- Inspect the background and transparent navbar at desktop and mobile widths.

No task needs another implementation pass based on automated frontend checks. Backend behavior still needs its targeted pytest run in an environment with Django installed.

## Files and working tree

Task/knowledge files modified or added: `.arc-knowledge/repo_index.md`, `.arc-knowledge/repo_map.json`, `backend/planning/models.py`, `backend/planning/serializers.py`, `backend/planning/services/domain_commands.py`, `backend/planning/services/history.py`, `backend/planning/tests/test_task_editor.py`, `backend/planning/migrations/0021_planningitem_due_date_inherited.py`, `frontend/src/components/student/StudentLayout.jsx`, `frontend/src/features/planner/PlannerPage.jsx`, `frontend/src/features/planner/PlannerPage.overdueNavigation.test.jsx`, `frontend/src/features/planner/components/CreatePlanningItemPanel.jsx`, `frontend/src/features/planner/components/CreatePlanningItemPanel.test.jsx`, `frontend/src/features/planner/components/PlannerTreeItem.jsx`, `frontend/src/features/timeline/Timeline.css`, `frontend/src/features/timeline/TimelineWorkflows.test.jsx`, and this report.

Pre-existing unrelated dirty work remains in `AGENTS.md`, `docs/implementation/ARC.md`, Focus files, Planner sidebar files, multiple Timeline board/sidebar/page/navigator files and tests, `frontend/vitest.config.js`, `.arc-knowledge/validate_index.py`, and the untracked Focus/Timeline helper tests. No existing change was reset, staged, committed, or discarded.
