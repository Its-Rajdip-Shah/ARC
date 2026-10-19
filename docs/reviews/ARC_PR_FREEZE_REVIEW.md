# ARC PR freeze review

Verdict: READY FOR PR, WITH MANUAL REVIEW NOTES.

## Scope

- Branch reviewed: `feature/arc-next-development` at `02fca2124c39c459953b05a9347982cff1ffd4a6`.
- Proposed target: `origin/integration/arc-workflows-pr` / `arc-pilot-001-before-test-fix-20261013t153554z` at `574fb67ca086dd2c8a9f68b7ad0295ad44ae44e5`.
- Reviewed committed range: `574fb67..02fca21` (nine commits, 48 files).
- Reviewed dirty scope: 30 modified tracked files and 11 untracked source/test/migration/support files; no staged files.

## Findings

### Final backend verification repairs (2026-10-18)

- `GET /api/planning/items/{id}/dependency_graph/` now normalizes nullable
  persisted descriptions to `""`, matching the graph UI's text contract while
  leaving the nullable domain field and its defensive frontend handling intact.
- The graph detail lookup now eager-loads `user`. `IsOwner` still runs as the
  object-level isolation backstop, but no longer adds a lazy fifth query;
  the existing four-query regression budget remains valid and has no N+1 path.
- The Timeline anchor conflict test used stale literal dates despite deriving
  its fixture dates from the current local day. Its expectations now derive
  from `due` and `target`. The endpoint uses date values directly and retains
  the established user-local timezone behavior; this was test brittleness,
  not a production timezone or arithmetic defect.

### BLOCKER — repaired

- The graph-editor regression still required visible `#id` text after the accepted compact graph design had intentionally moved identity to accessible node labels. This made the full frontend suite fail despite the component preserving task identity. The repaired assertion is at `frontend/src/features/planner/components/CreatePlanningItemPanel.test.jsx:357-358`; it now asserts the accessible labels for same-titled nodes.

### IMPORTANT — retained risk

- `backend/planning/views.py:182-216` loads every non-deleted dependency edge and every visible item belonging to the user in order to render one connected component. It is tenant-isolated and avoids N+1 queries, but response work grows with the entire account rather than the graph component. A bounded recursive/component query should be scheduled before accounts can contain large dependency graphs. This is not a correctness or data-isolation blocker for the current accepted browser behavior.

### NONBLOCKING — repaired

- `frontend/src/features/timeline/TimelinePage.jsx:495-505` contained a duplicated `setNavigatorVisible(false)` call in its reconciliation effect. One duplicate was removed.
- `frontend/src/features/focus/FocusTaskRow.jsx:1-52` retained unused icon and props after the Focus UI changes. They were removed.
- Production build reports a 644.72 kB minified JavaScript entry chunk. This is a performance warning, not a build failure; defer code splitting to a separately scoped performance change.

## Repair summary

- Restored a passing graph identity regression assertion without restoring rejected visible ID text.
- Removed the duplicate Timeline state call and unused Focus declarations.
- Removed trailing whitespace reported by `git diff --check` in `docs/implementation/ARC.md`.
- Updated affected repository-knowledge hashes; validation passes.

## Security and domain review

- Dependency creation remains user-scoped in `backend/planning/views.py:253-289`; the service rejects self-edges, cross-user edges, duplicates, and cycles in `backend/planning/services/dependencies.py:27-90`.
- Graph reads obtain the root item through the scoped viewset queryset and apply user/deleted filters again to edges and hierarchy (`backend/planning/views.py:181-216`).
- Due-date provenance is persisted in migration `backend/planning/migrations/0021_planningitem_due_date_inherited.py:1-17`, serialized read-only in `backend/planning/serializers.py:126-142`, and propagated only to inherited children in `backend/planning/services/domain_commands.py:11-26`.
- Priority mutations remain routed through the dedicated reorder command from `frontend/src/features/planner/PlannerPage.jsx:142-147` and `:183-187`; direct item priority writes remain read-only on the backend.

## Migration review

- `0021_planningitem_due_date_inherited` is additive, nullable-free, default-false, and depends on `0020`; migration graph inspection identifies it as the sole planning leaf.
- Existing rows deliberately remain non-inherited rather than inferring historical user intent. This is conservative and covered by `backend/planning/tests/test_task_editor.py`.
- `makemigrations --check --dry-run` reported no model changes. PostgreSQL-backed migration consistency/application checks subsequently passed locally.

## Verification

| Check | Result |
| --- | --- |
| `npm run test:unit` | PASSED — 22 files, 270 tests passed, 2 skipped |
| `npm run build` | PASSED — Vite production build completed; chunk-size warning only |
| `npm run lint` | PASSED with existing warnings; no lint errors |
| `.venv/bin/python manage.py check` | PASSED — no issues |
| `.venv/bin/python manage.py makemigrations --check --dry-run` | PASSED — no changes |
| Migration graph load | PASSED — leaf `planning.0021_planningitem_due_date_inherited` |
| PostgreSQL-backed backend planning suite | PASSED locally |
| Focused backend regressions (including final graph/timeline coverage) | PASSED locally against PostgreSQL |
| Migration consistency/application checks | PASSED locally against PostgreSQL |
| `python3 .arc-knowledge/validate_index.py` | PASSED |
| `git diff --check` / staged whitespace check | PASSED |

## Remaining manual checks

- Browser-check desktop and narrow viewport flows for Planner dependency picker/graph, due-date inheritance, priority edit/reorder, Timeline overdue navigation, Focus details, and background/navigation continuity.
- Exercise a large account with many unrelated dependency edges before broad rollout; see the retained important query-scope risk.

No automated verification blocker remains in the inspected code. The PR is ready for preparation; the manual browser and large-account checks above remain reviewer/release notes rather than automated test gaps.
