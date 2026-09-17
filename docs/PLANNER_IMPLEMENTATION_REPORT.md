# ARC Planner / Student Shell — Branch Implementation Audit

**Branch audited:** `feature/6-student-shell`
**Baseline / merge-base:** `9de10f816d66da261d49b2bb83dc7299af6d77a2` (`origin/main` at the time of the audit)
**Audit basis:** complete unstaged tracked diff plus the contents/inventory of untracked source files captured in `arc-branch-audit.txt`.
**State at audit time:** no commits existed on this branch after the merge-base; therefore the working tree represented the complete branch delta.

> This document records what is present in the audited branch. It deliberately separates implemented functionality from scaffolding and cleanup candidates. It does not claim that placeholder UI is complete.

---

## 1. Executive summary

This branch is substantially broader than its current name, `feature/6-student-shell`. It contains:

1. a student-facing application shell and protected student routing;
2. a custom student login/MFA interface;
3. the Planner feature and its tree-based task editor;
4. nested-task creation/editing and tag handling;
5. hierarchical drag-and-drop and keyboard hierarchy controls;
6. root-task management and root reordering from the sidebar;
7. Planner search, display controls, completed-task filtering and persistent toolbar preferences;
8. backend reversible Planner history with undo/redo;
9. soft deletion required to make task deletion reversible;
10. supporting migrations, tests, styling, assets and frontend architecture documentation;
11. a Priority view/toggle shell that is present but not yet functionally implemented.

The Planner UI is therefore backed by real planning API state rather than demo-only state, while Priority remains a future implementation area.

---

## 2. Git scope and audit method

At audit time:

- current branch: `feature/6-student-shell`;
- the branch had no configured upstream;
- `HEAD` and the merge-base with `origin/main` were the same commit;
- there were no committed branch-specific commits;
- all branch work was unstaged/uncommitted;
- the tracked diff contained 11 modified files;
- 28 untracked paths were reported;
- four of those were `.sticky-backup` working backups and were not included in the source-content bundle;
- binary assets were inventoried separately.

This matters because `git diff` alone would not contain untracked source files. The audit therefore combined the tracked diff with a complete untracked-file inventory and the contents of untracked text/source files.

---

## 3. Backend planning changes

### 3.1 Soft deletion

`PlanningItem` now has an indexed `is_deleted` Boolean field. A `PlanningItemQuerySet.visible()` helper filters out soft-deleted rows, and `for_user()` now automatically uses that visible set.

The recursive planning-tree query was updated so deleted roots and deleted descendants are excluded. Parent-map, hierarchy sibling lookup, completion/reopen operations and overdue title lookup were likewise changed to ignore deleted items.

**Purpose:** deletion must be undoable. A task cannot be physically destroyed immediately if undo is expected to restore its original ID, hierarchy, tags, assignment detail and other state.

### 3.2 Planner history model

A new `PlanningHistoryEntry` model stores reversible Planner actions. It records:

- user ownership;
- action type;
- `before_state`;
- `after_state`;
- whether the entry is currently undone;
- creation time.

Supported action types are:

- `CREATE`
- `UPDATE`
- `DELETE`
- `MOVE`
- `COMPLETE`

The history model uses JSON state payloads so one user action can represent multiple affected rows, such as sibling-order changes or subtree completion.

### 3.3 History service

A new `backend/planning/services/history.py` implements bounded, delta-oriented undo/redo.

Rather than snapshotting the complete Planner for every operation, it captures the rows/state relevant to the action. The service includes support for:

- serialising complete reversible planning-item state;
- capturing selected items;
- capturing sibling order;
- capturing priority membership/order;
- recording checkpoints;
- restoring item state;
- restoring sibling state;
- restoring priority state;
- soft-delete restoration;
- undo;
- redo;
- history status;
- redo-branch invalidation after a new action;
- limiting retained history to 100 entries;
- garbage collection of soft-deleted rows that can no longer be restored by retained history.

A particularly important safety case is handled: if a deletion is undone and then a new action destroys the redo branch, the restored rows must **not** be physically deleted. Conversely, still-deleted rows whose restoring checkpoint is pruned can be hard-deleted.

### 3.4 Mutation history integration

Planning-item mutation endpoints now create history checkpoints.

**Create:** captures priority state before/after and records enough state to undo creation by deleting the created item and redo it by restoring its captured state.

**Update:** captures the item before and after the serializer update.

**Delete:** resolves the full subtree, captures sibling and priority state, releases affected priority positions, then marks the subtree `is_deleted=True` instead of immediately deleting rows.

**Move:** captures affected sibling collections before and after parent/order changes. Explicit 1-based sibling placement is persisted after moving.

**Complete/reopen:** captures affected item state and priority state around completion changes. Completing a task may affect its descendants, whereas reopening captures only the appropriate affected item set.

### 3.5 History API

Three planning endpoints were added:

- `GET planning/items/history-status/`
- `POST planning/items/undo/`
- `POST planning/items/redo/`

Undo/redo responses report whether anything changed, the action type when applicable, and the latest `can_undo` / `can_redo` status.

### 3.6 Backend migrations

Two migrations are present:

- `0002_planninghistoryentry.py` — creates the history table/model.
- `0003_planningitem_is_deleted.py` — adds soft deletion to planning items.

These migrations are functional source changes and should be committed with the backend implementation.

### 3.7 Backend tests

`backend/planning/tests/test_history.py` covers at least these cases:

- update → undo → redo;
- create → undo → redo;
- subtree delete → undo → redo;
- move → undo → redo;
- completion-state undo/redo;
- a new action after undo invalidating the redo branch;
- history capped at 100 entries;
- history-status reporting;
- discarded redo deletion not destroying rows restored by undo;
- hard deletion of still-deleted rows after the relevant history checkpoint is pruned.

These tests specifically exercise the non-trivial data-integrity cases introduced by reversible deletion/history.

---

## 4. Student application shell

### 4.1 Routing

`frontend/src/App.jsx` was expanded from the previous admin/development routing to include the student application.

The root route now redirects to `/login`.

Student routes include:

- `/login`
- protected `/planner`

The existing connection page moved to `/dev/connection`.

Admin routing remains separate and continues under `/admin/*`.

### 4.2 Student route guard

`StudentRoute.jsx` protects student routes using the existing authentication store.

Behaviour:

- if neither access nor refresh token exists, redirect to `/login`;
- a persisted refresh token is accepted as evidence of an existing session while `SessionHydrator` restores the short-lived access token;
- authenticated admin users are redirected to `/admin`;
- authenticated non-admin users may render student routes.

### 4.3 Student layout

`StudentLayout.jsx` establishes persistent student chrome while leaving feature-specific sidebars to individual features.

It owns:

- the top-centre student view navigation;
- hamburger button;
- navigation drawer;
- React Router `Outlet`.

The layout header begins at `left-arc-sidebar`, allowing Planner's sidebar width token to define the remaining application region.

### 4.4 Navigation drawer

The student drawer visually lists:

- Account
- Settings
- Marks
- Planner
- Timeline
- Logout

Logout is functional: it clears the auth session and navigates to `/login`.

**Current limitation:** the other menu labels are rendered as buttons but the audited implementation does not attach navigation handlers to them. They should therefore be treated as shell/scaffolding, not completed navigation.

### 4.5 Planner / Timeline toggle

`ViewToggle.jsx` defines Planner and Timeline navigation targets. Planner exists in this branch; Timeline is represented in navigation but is not implemented by this branch.

### 4.6 SearchBar component

A standalone `SearchBar.jsx` remains in the student component directory.

The current Planner implementation uses its own toolbar-integrated search instead of the previous redundant top-navigation search. This standalone component therefore appears to be unused by the current student layout and should be checked with import search before committing.

---

## 5. Student login

`StudentLoginPage.jsx` adds a dedicated student login UI using the existing authentication API.

The implementation includes:

- email/password credential submission;
- MFA/TOTP verification flow;
- multi-cell verification-code input behaviour;
- transition to `/planner` after successful MFA;
- login background asset.

The branch also adds `frontend/src/assets/auth/login-background.png`.

---

## 6. Planner architecture

The Planner implementation is organised under `frontend/src/features/planner/`.

Main components:

- `PlannerPage.jsx` — feature orchestration, toolbar, panel ownership and history controls;
- `PlannerSidebar.jsx` — root list, root creation and root reordering;
- `PlannerTree.jsx` — tree transformation, search/filtering, hierarchy keyboard actions and DnD;
- `PlannerTreeItem.jsx` — individual task rendering, completion and row interactions;
- `CreatePlanningItemPanel.jsx` — create/edit form;
- `PriorityPanel.jsx` — current Priority shell;
- `PriorityToggle.jsx` — opens/closes Priority;
- `plannerDemoData.js` — demo data still present.

Server state is handled through TanStack Query and the planning API.

---

## 7. Planner sidebar and root tasks

The Planner sidebar:

- displays the ARC brand/logo;
- labels the section `ROOTS`;
- displays root-task names;
- truncates root titles after 30 characters while preserving the full title in the button tooltip;
- supports root creation;
- supports root reordering through `@dnd-kit`;
- writes reorder operations through the planning move API;
- invalidates planning-tree state after successful moves.

The sortable root transform explicitly neutralises X/Y scaling to prevent the dragged root from visually stretching.

The shared sidebar token is now:

`--spacing-arc-sidebar: 216px`

This reflects the later +30px sidebar-width adjustment and is reused by layout/priority positioning.

---

## 8. Planner tree rendering and hierarchy

### 8.1 Flattened tree representation

`PlannerTree.jsx` converts the nested planning tree into a flattened representation containing parent/depth information for DnD and hierarchy calculations.

Descendant IDs are calculated so a dragged task's subtree can be treated correctly.

### 8.2 Drag-and-drop projection

The tree uses `@dnd-kit/core`, sortable utilities and a projected depth/parent model.

The implementation supports:

- vertical task reordering;
- hierarchical indentation while dragging;
- movement of a task with its subtree;
- projected placement before the final mutation;
- prevention of invalid hierarchy outcomes;
- explicit sibling ordering through the backend move endpoint.

### 8.3 Root constraints

Root tasks are protected from keyboard indentation/outdent operations that would violate the intended hierarchy.

### 8.4 Keyboard indentation

When a non-first child is hovered, `Tab` can indent it beneath the sibling immediately above it. The moved task becomes the bottom-most child of that preceding sibling.

The item's subtree moves with it because the operation changes the parent of the subtree root rather than flattening its descendants independently.

A first child cannot be indented because there is no previous sibling available to become its new parent.

Root tasks cannot be indented.

### 8.5 Keyboard outdent

Plain `Delete` / `Backspace` on the hovered task performs one-level outdent rather than destructive deletion.

The outdented task is placed immediately after its former parent in the new sibling collection.

Root tasks cannot be outdented.

### 8.6 Destructive delete shortcut

`Cmd/Ctrl + Delete` deletes the hovered task through the backend.

Because backend deletion operates on the subtree, descendants are removed from the visible Planner together with the selected task while remaining recoverable through history.

If the deleted task owns the currently open edit/add panel, the panel is cancelled.

---

## 9. Task selection, details and panel ownership

Planner page state distinguishes selected/hovered tasks from the task that owns an open create/edit panel.

The audited implementation contains handlers for:

- selecting an item;
- editing an item;
- creating a nested item;
- closing the panel;
- handling deletion of the panel owner.

This supports the interaction model developed during Planner implementation where ordinary row interaction should not arbitrarily transfer ownership of an already-open form.

`PlannerTreeItem` also supports row-level detail display and direct task completion.

---

## 10. Create / edit planning item panel

`CreatePlanningItemPanel.jsx` supports both creation and editing workflows.

The form includes, as represented in the audited source:

- item type controls;
- title;
- description;
- tags;
- creation of new tags;
- selected-tag toggling;
- start date;
- due date;
- additional planning/assignment fields present in the component;
- create/update mutations;
- query invalidation after mutation.

The panel uses the planning/tag API rather than maintaining a disconnected local task model.

---

## 11. Completion behaviour

Planner task completion is backed by the planning completion API.

Backend completion can affect a subtree and releases priority positions for completed items. Reopening follows the backend's existing asymmetrical rule and does not silently reopen an entire subtree.

Frontend completion invalidates both the planning tree and priority query state.

---

## 12. Completed-task visibility

`PlannerTree.jsx` contains a completed-item filter.

The toolbar allows the user to show or hide completed tasks.

A later search fix intentionally changes the interaction between filtering and search:

- with no search query, the completed visibility preference is respected normally;
- while searching, the search operates over the full task tree so an explicitly searched completed task can still be found;
- clearing the query returns immediately to the normal completed-task visibility setting.

This avoids a hidden completed task making a legitimate search appear broken.

---

## 13. Planner search

Planner search is integrated into the Planner toolbar rather than the student top navigation.

`searchPlanningTree()` performs contextual tree filtering.

The implementation searches task content and builds a result tree that retains relevant hierarchy/context instead of returning an unrelated flat list.

Direct search matches are tracked separately (`matchedIds`) so `PlannerTreeItem` can visually distinguish matched tasks.

Search is transient and is intentionally **not** persisted across reloads.

The standalone student `SearchBar.jsx` is no longer used by the current Planner toolbar flow and is a cleanup candidate pending import verification.

---

## 14. Toolbar display preferences

The Planner toolbar controls at least:

- show/hide all task details;
- show/hide task checkboxes;
- show/hide completed tasks;
- undo;
- redo;
- search.

The three display preferences are persisted in browser `localStorage` under:

`arc.planner.toolbar`

Defaults in the audited source are:

- details: off;
- checkboxes: on;
- completed: on.

On reload/revisit, valid stored Boolean values are restored. Missing/invalid storage falls back to defaults.

Search, hover state, panel ownership and undo/redo UI state are intentionally not stored as browser preferences.

---

## 15. Undo / redo frontend integration

`frontend/src/api/planning.js` adds API wrappers for:

- history status;
- undo;
- redo.

`PlannerPage.jsx` queries current history status and exposes undo/redo mutations.

After undo or redo, affected query caches are invalidated/refreshed, including planning tree and priority state.

Global keyboard handling provides Planner undo/redo shortcuts in addition to toolbar buttons, subject to current `can_undo`, `can_redo` and mutation-pending state.

This frontend history UI is backed by the server-side history described earlier rather than a purely local React history stack.

---

## 16. Priority state in this branch

Priority is **not yet a complete feature**.

What exists:

- `PriorityToggle.jsx`;
- `PriorityPanel.jsx`;
- Planner-level state for opening/closing Priority;
- layout transitions using the shared sidebar token;
- query invalidation hooks in Planner mutations where priority state may be affected.

`PriorityPanel.jsx` currently renders essentially a titled shell (`Priority`).

The architecture documentation explicitly says the exact Priority routing/state model will be decided when Priority is implemented.

Therefore Priority should not be represented in a PR description as completed functionality.

---

## 17. Styling and assets

### 17.1 Theme

A dedicated `frontend/src/styles/theme.css` centralises ARC design tokens.

The global stylesheet now imports:

- Google `Jaro` font;
- Tailwind;
- ARC theme CSS.

The sidebar width token is currently 216px.

### 17.2 Brand asset

`frontend/src/assets/brand/arc-logo.svg` is added for the ARC logo.

SVG is resolution-independent, so separate pixel-resolution copies are not required for ordinary web rendering.

### 17.3 Login asset

`frontend/src/assets/auth/login-background.png` is added for the student login design.

---

## 18. Frontend dependencies

The branch adds:

- `@dnd-kit/core`
- `@dnd-kit/sortable`
- `@dnd-kit/utilities`
- `lucide-react`

The package lock was correspondingly updated.

`dnd-kit` supports the Planner/root sortable interactions. `lucide-react` supplies maintainable UI icons instead of exporting ordinary interface icons from Figma.

---

## 19. Frontend architecture documentation

`docs/FRONTEND_ARCHITECTURE.md` documents the intended student frontend structure.

Important decisions recorded there include:

- `MVP arc` / Figma node `2690:432` is the implementation source;
- legacy `Text` terminology becomes `Planner`;
- canonical Planner route is `/planner`;
- Figma frames represent visual states, not automatically routes/components;
- `StudentLayout` owns persistent student chrome;
- feature-specific sidebars remain owned by their feature;
- TanStack Query owns server state;
- the existing Zustand store owns auth/session state;
- admin remains architecturally separate;
- Priority is Planner-associated, not global chrome.

This file is useful project documentation rather than generated output.

---

## 20. Files changed — tracked

- `.gitignore`
- `backend/planning/models.py`
- `backend/planning/queries.py`
- `backend/planning/services/hierarchy.py`
- `backend/planning/services/overdue.py`
- `backend/planning/views.py`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/src/App.jsx`
- `frontend/src/api/planning.js`
- `frontend/src/index.css`

### Tracked-file purpose summary

| File | Purpose of branch change |
|---|---|
| `.gitignore` | Ignore additional local/generated material introduced during development. |
| `backend/planning/models.py` | Visible queryset, soft deletion and Planner history model. |
| `backend/planning/queries.py` | Exclude soft-deleted rows from recursive tree/parent lookup. |
| `backend/planning/services/hierarchy.py` | Make hierarchy/completion operations operate on visible items. |
| `backend/planning/services/overdue.py` | Exclude deleted task titles from overdue processing. |
| `backend/planning/views.py` | History-aware create/update/delete/move/complete plus undo/redo endpoints. |
| `frontend/package.json` | Add DnD and icon dependencies. |
| `frontend/package-lock.json` | Lock dependency graph for the new packages. |
| `frontend/src/App.jsx` | Add student login, student route/layout and Planner routing. |
| `frontend/src/api/planning.js` | Add history status, undo and redo API wrappers. |
| `frontend/src/index.css` | Load Jaro and ARC theme CSS. |

---

## 21. Files added — source/content captured by audit

- `backend/planning/migrations/0002_planninghistoryentry.py`
- `backend/planning/migrations/0003_planningitem_is_deleted.py`
- `backend/planning/services/history.py`
- `backend/planning/tests/test_history.py`
- `docs/FRONTEND_ARCHITECTURE.md`
- `frontend/src/components/student/HamburgerButton.jsx`
- `frontend/src/components/student/NavigationDrawer.jsx`
- `frontend/src/components/student/SearchBar.jsx`
- `frontend/src/components/student/StudentLayout.jsx`
- `frontend/src/components/student/StudentViewNav.jsx`
- `frontend/src/components/student/ViewToggle.jsx`
- `frontend/src/components/StudentRoute.jsx`
- `frontend/src/features/planner/components/CreatePlanningItemPanel.jsx`
- `frontend/src/features/planner/components/PlannerSidebar.jsx`
- `frontend/src/features/planner/components/PlannerTree.jsx`
- `frontend/src/features/planner/components/PlannerTreeItem.jsx`
- `frontend/src/features/planner/components/PriorityPanel.jsx`
- `frontend/src/features/planner/components/PriorityToggle.jsx`
- `frontend/src/features/planner/data/plannerDemoData.js`
- `frontend/src/features/planner/PlannerPage.jsx`
- `frontend/src/pages/student/StudentLoginPage.jsx`
- `frontend/src/styles/theme.css`

### Added-file purpose summary

| File | Purpose |
|---|---|
| `backend/planning/migrations/0002_planninghistoryentry.py` | Schema migration for reversible history. |
| `backend/planning/migrations/0003_planningitem_is_deleted.py` | Schema migration for soft deletion. |
| `backend/planning/services/history.py` | Bounded delta-based Planner undo/redo engine. |
| `backend/planning/tests/test_history.py` | History/data-integrity tests. |
| `docs/FRONTEND_ARCHITECTURE.md` | Student frontend architecture and Figma implementation rules. |
| `frontend/src/components/StudentRoute.jsx` | Protected non-admin student route. |
| `frontend/src/components/student/HamburgerButton.jsx` | Student navigation trigger. |
| `frontend/src/components/student/NavigationDrawer.jsx` | Student drawer and logout. |
| `frontend/src/components/student/SearchBar.jsx` | Standalone search component; likely obsolete after toolbar search integration. |
| `frontend/src/components/student/StudentLayout.jsx` | Persistent student chrome and feature outlet. |
| `frontend/src/components/student/StudentViewNav.jsx` | Top-centre view navigation container. |
| `frontend/src/components/student/ViewToggle.jsx` | Planner/Timeline view links. |
| `frontend/src/features/planner/PlannerPage.jsx` | Main Planner feature orchestration. |
| `frontend/src/features/planner/components/CreatePlanningItemPanel.jsx` | Create/edit task panel. |
| `frontend/src/features/planner/components/PlannerSidebar.jsx` | Root sidebar, root creation and root DnD. |
| `frontend/src/features/planner/components/PlannerTree.jsx` | Tree search/filtering, hierarchy operations and DnD. |
| `frontend/src/features/planner/components/PlannerTreeItem.jsx` | Individual task row interactions/rendering. |
| `frontend/src/features/planner/components/PriorityPanel.jsx` | Priority feature shell. |
| `frontend/src/features/planner/components/PriorityToggle.jsx` | Priority open/close control. |
| `frontend/src/features/planner/data/plannerDemoData.js` | Demo Planner data; likely no longer required by live API Planner. |
| `frontend/src/pages/student/StudentLoginPage.jsx` | Student login and MFA UI. |
| `frontend/src/styles/theme.css` | ARC theme/design tokens. |

---

## 22. Binary assets present in the branch inventory

These untracked assets were reported by Git but were not copied as text into the audit bundle:

- `frontend/src/assets/auth/login-background.png`
- `frontend/src/assets/brand/arc-logo.svg`

Their use is evidenced by imports in the audited source.

---

## 23. Cleanup candidates before staging

### 23.1 `.sticky-backup` files — exclude/remove

The audit inventory reported:

- `frontend/src/components/student/StudentLayout.jsx.sticky-backup`
- `frontend/src/features/planner/PlannerPage.jsx.sticky-backup`
- `frontend/src/features/planner/components/PlannerTree.jsx.sticky-backup`
- `frontend/src/features/planner/components/PlannerTreeItem.jsx.sticky-backup`

These are development backups, not application source, and should not be staged.

### 23.2 `SearchBar.jsx` — verify then probably remove

The current `StudentLayout` imports `StudentViewNav`, not `SearchBar`, and Planner now owns its toolbar search.

Run an import/reference search before deletion. If there are no live imports, this component is obsolete.

### 23.3 `plannerDemoData.js` — verify then probably remove

The current Planner is wired to planning API/query state. Demo data appears to be leftover scaffolding.

Again, verify references before deleting.

### 23.4 Navigation drawer placeholders

Account, Settings, Marks, Planner and Timeline are displayed, but the audited drawer does not attach navigation handlers to those menu buttons. Only Logout is currently functional.

This is not necessarily garbage: it may intentionally represent shell work for future pages. It should simply be documented as incomplete rather than mistaken for working navigation.

### 23.5 Priority shell

Priority files should remain if Priority is the next planned implementation. They are valid scaffolding, but the feature is not complete.

---

## 24. Verification still required before commit

The audit records source changes, not the final test result. Before staging/committing, run the project's real verification commands and record their results.

Recommended minimum:

```bash
cd frontend
npm run build
npm run lint
cd ..

python manage.py check
python manage.py test planning
```

Use the repository's actual backend working directory/command if `manage.py` is not at repository root.

Also verify migrations are applied/consistent:

```bash
python manage.py makemigrations --check
python manage.py migrate
```

Do not generate an extra migration merely to make the check quiet; investigate if Django reports model drift.

---

## 25. Recommended final manual regression

Before integration, manually verify:

1. student login and MFA path;
2. unauthenticated `/planner` redirect;
3. admin/student route separation;
4. root creation;
5. root sidebar reorder synchronises with editor order;
6. nested task create/edit;
7. completion and subtree completion behaviour;
8. show/hide completed;
9. search by supported task content;
10. completed task can be surfaced by an explicit search while completed items are normally hidden;
11. clearing search restores the completed filter;
12. task drag/reparent/reorder;
13. `Tab` indent restrictions;
14. plain Delete/Backspace outdent restrictions;
15. Cmd/Ctrl+Delete subtree deletion;
16. undo/redo for create/update/delete/move/complete;
17. toolbar preferences survive reload;
18. search query does not survive reload;
19. sidebar drag preview has no vertical stretching;
20. panel closes safely if its owning task is deleted.

---

## 26. Integration implications

Because the branch had no commits after its merge-base at audit time, the safest integration sequence is:

1. remove only confirmed temporary/dead files;
2. run build/lint/backend tests/migration checks;
3. inspect `git status` and final `git diff`;
4. stage deliberately;
5. create a coherent feature commit (or team-required commit structure);
6. fetch the latest remote state;
7. integrate current `origin/main` **into the feature branch**, without directly modifying `main`;
8. resolve any conflicts on the feature branch;
9. rerun verification;
10. push the feature branch;
11. open/integrate through the team's required GitHub workflow.

The existing local project environment does not need to be re-created merely because the branch is renamed, committed, synchronised or pushed.

---

## 27. Branch-name observation

`feature/6-student-shell` no longer accurately describes the complete branch scope. The branch now contains both student-shell work and a substantial Planner implementation including backend history.

Whether it should be renamed depends on the team's issue/branch convention. Renaming should be done only after confirming that convention, especially if the `6` maps to a tracked issue/task.

---

## 28. Final audit assessment

The audited working tree represents a coherent vertical Planner slice rather than a collection of isolated UI mockups:

- student authentication/routing reaches the Planner;
- Planner reads/writes canonical planning data;
- hierarchy changes are persisted;
- deletion is reversible;
- undo/redo is server-backed;
- UI state and server state are separated appropriately;
- DnD and keyboard hierarchy interactions are implemented;
- display preferences persist locally;
- the implementation includes backend tests for the most dangerous history/deletion cases.

The principal pre-commit work is therefore **cleanup and verification**, not another Planner feature pass.

Priority is the natural next feature, but it should begin only after this Planner checkpoint has been safely documented, cleaned, tested and integrated.

---

## Appendix A — Audit provenance

This report was generated from `arc-branch-audit.txt`, which contained:

- `git status --short`;
- the complete human-readable unstaged tracked diff;
- the untracked-file inventory;
- complete contents of untracked text/source files.

At capture time the tracked diff was reported as 947 lines, and the complete assembled audit was 5,504 lines / approximately 146 KB.

The report intentionally does **not** treat `.sticky-backup` files as implementation source, and it does not infer binary image contents beyond their filenames and source-code usage.
