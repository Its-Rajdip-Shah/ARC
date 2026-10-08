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
- Study-plan model calls stay in Django. The browser only uses `/api/planning/study-plans/`.