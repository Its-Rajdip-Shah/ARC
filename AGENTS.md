# ARC (Goals Tracker) Project Rules

## Tech Stack
- **Backend:** Django 6.1.1, Django REST Framework, PostgreSQL.
- **Frontend:** React, Vite, Tailwind CSS v4.
- **Structure:** Monorepo with `backend/` and `frontend/` directories.

## Git & Workflow Conventions
- **Branching:** Use `feature/<feature-name>` for all new development.
- **Commits:** Commit small and often after logical units of work.
- **Messages:** Use imperative verbs (e.g., "Add user authentication routing").
- **Constraints:** Never commit `.env` files, `__pycache__`, or `db.sqlite3`.

## Architecture Rules
- Ensure strict data isolation (users can only access their own data).
- Use `core` apps for shared mixins and permissions.
- Do not invent missing Canvas API data; handle nulls gracefully.
- Password changes and reset approval stay in Django. The browser uses `/api/auth/password/change/`, `/api/auth/password-reset/`, and `/api/admin/password-resets/`.

<!-- ARC_KNOWLEDGE_WORKFLOW_V1_START -->
## Persistent Repository Intelligence — Mandatory

Before every implementation:
1. Read `.arc-knowledge/repo_index.md` and the relevant entries in
   `.arc-knowledge/repo_map.json`. Read architecture.md when boundaries matter.
2. Inspect actual affected source, relevant tests, frozen contracts,
   Git status and uncommitted changes before editing.
3. Treat the map as navigation, not verified runtime semantics.
4. Preserve existing team rules, architecture, tests, history and pending PR.

After every implementation:
1. Inspect the actual diff and identify added, modified and removed files.
2. Incrementally update ONLY affected `repo_map.json` entries:
   SHA-256, byte length, symbols, imports, local import edges, reverse edges,
   classifications and descriptions as applicable.
3. Update `repo_index.md` only for changed responsibilities/navigation.
   Update `.arc-knowledge/architecture.md` only for architectural changes.
4. Preserve unaffected entries and historical snapshot provenance.
   Never regenerate the entire 358-file index without a justified reason.
5. Never replace an old hash without inspecting the corresponding source.
6. Run `python3 .arc-knowledge/validate_index.py`.
   A passing validator proves index consistency, not behavior.
7. Run relevant regression tests; never delete or weaken protected tests.
8. Report files changed, knowledge changes, test results, remaining risks,
   and final Git status.

Do not silently commit, rebase, reset, force-push, or discard user edits.
Obtain approval before modifying frozen product or domain semantics.
<!-- ARC_KNOWLEDGE_WORKFLOW_V1_END -->
