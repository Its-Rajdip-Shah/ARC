# ARC V3 planning workflows and dependency DAG

## Suggested title

Complete ARC V3 planner, timeline, task editing, and dependency DAG workflows

## Summary

This PR combines the branch's V3 work since `574fb67` with the accepted browser dependency workflow. It adds task-dependency creation and component visualization, explicit inherited due-date provenance, priority-position editing through the canonical reorder endpoint, overdue navigation/presentation improvements, unified date controls, timezone settings, and related Planner, Timeline, Focus, and student-shell refinements.

## Feature breakdown

- Planner: task priority-position editing, inherited-date preservation, dependency picker, and read-only dependency DAG modal.
- Backend: `dependency_graph` API action, directional dependency graph response, due-date inheritance field/migration/propagation, and history serialization.
- Timeline: overdue filters/navigation, date-card and toolbar refinements, root/task navigation, timezone interactions.
- Focus and shell: task-detail styling/behavior and shared student background continuity.
- Quality: regression coverage for dependencies, due-date inheritance, priority, overdue navigation, Focus behavior, and Timeline rendering.

## API and migration notes

- New `GET /api/planning/items/{id}/dependency_graph/` returns the selected task's connected dependency component, directional edges, and safe visible hierarchy ancestry.
- Existing prerequisite mutation API remains the sole dependency-write boundary.
- Migration `planning.0021_planningitem_due_date_inherited` adds a non-null boolean defaulting to `false`. New children whose due date is omitted inherit and track the direct parent; legacy rows are conservatively treated as explicit.
- `priority_position` remains backend read-only. The client invokes `/priority/reorder/` only after an explicitly changed valid position.

## Testing evidence

- Frontend unit tests: 270 passed, 2 skipped.
- Production build: passed.
- PostgreSQL-backed backend planning suite and focused backend regressions: passed locally.
- Django checks, migration autodetection, migration consistency/application checks, migration graph, repository knowledge validation, and whitespace checks: passed.
- Final freeze repair coverage keeps the dependency graph response description
  string-safe for nullable legacy rows, preserves its four-query detail budget,
  and derives Timeline anchor conflict dates from the test fixture rather than
  a stale calendar day.

## Reviewer guidance

- Inspect the dependency direction wording and the `prerequisites` endpoint mapping in `DependencyDialog.jsx`.
- Confirm the graph modal's accessible labels distinguish same-titled tasks without putting noisy IDs into cards.
- Review inherited due-date behavior when a child is created, made explicit, reparented, and restored from history.
- Exercise Timeline overdue filtering/navigation with deadline-overdue and expired-anchor-only tasks.

## Known limitations

- The dependency graph endpoint currently bulk-loads all visible dependency edges/items for the user before extracting the selected component. It is correct and tenant-scoped, but should be component-bounded for large accounts.
- Production bundle warning: the main minified JS chunk is above Vite's 500 kB advisory threshold.

## Manual validation / screenshots

- No screenshots were captured in this headless audit.
- Before merge, complete the retained manual browser review of Planner dependency picker/DAG and Timeline overdue navigation at desktop and narrow mobile widths, including loading/error/empty states.
