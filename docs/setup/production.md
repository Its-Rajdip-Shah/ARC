# ARC Production-Style Live Test Guide

This guide describes how to validate an ARC implementation as a complete running system before it is accepted for a pull request, release checkpoint, demonstration or deployment handoff.

This is a **production-style local validation guide**, not a production infrastructure deployment manual.

Its goal is to answer:

> Can a clean machine obtain the intended ARC revision, install it from committed files only, create the required database state, start the backend, scheduler worker and frontend, and exercise the implementation successfully?

For active feature work, use `docs/setup/developer.md`.

---

# 1. What this validation should prove

A successful production-style live test should prove all of the following:

- the exact intended Git branch/commit is available remotely;
- a fresh clone contains every required source file, asset, migration and document;
- backend dependencies install from `requirements.txt`;
- the commit-pinned scheduler installs successfully;
- frontend dependencies install from `package-lock.json`;
- a new PostgreSQL database can migrate from zero to the current schema;
- no ignored files from the original developer machine are required;
- Django passes its system check;
- backend regression tests pass;
- frontend tests, lint and production build pass;
- backend and frontend development servers can start from the clean clone;
- authentication works;
- the changed user workflows behave correctly in the browser;
- scheduler and Timeline behavior matches the documented contracts.

---

# 2. Always validate the pushed revision

Do not validate only the developer's original working directory.

First ensure the intended feature branch has been committed and pushed.

Record:

    git branch --show-current
    git rev-parse HEAD

After pushing, verify the remote branch resolves to the same commit.

The validation clone must come from the remote repository, not by copying the local folder.

This proves that the remote branch contains everything another developer or reviewer will actually receive.

---

# 3. Create a separate validation folder

Choose a parent folder outside the normal ARC working copy.

Example:

    cd ~/somewhere/separate
    git clone <ARC repository URL> arc-pr-validation
    cd arc-pr-validation

Switch to the exact branch being validated:

    git fetch origin
    git switch --track origin/feature/nonblocking-scheduler

If the branch already exists locally:

    git switch feature/nonblocking-scheduler
    git pull --ff-only origin feature/nonblocking-scheduler

Record the exact commit:

    git rev-parse HEAD

It should match the commit intended for review.

---

# 4. Confirm the clone is clean

Run:

    git status

Expected:

    nothing to commit, working tree clean

Check that generated/local artifacts are absent:

- `backend/.venv`
- `backend/.env`
- local database files
- `frontend/node_modules`
- `frontend/.env.local`
- `frontend/dist`

These should be created locally during validation, not obtained from Git.

---

# 5. Backend clean setup

Enter the backend:

    cd backend

Create a completely new virtual environment.

macOS/Linux:

    python3 -m venv .venv
    source .venv/bin/activate

Windows PowerShell:

    python -m venv .venv
    .\.venv\Scripts\Activate.ps1

Install:

    python -m pip install -r requirements.txt

This must succeed without relying on another existing ARC virtual environment.

The install must also retrieve the pinned ARC scheduler package.

Current frozen scheduler source:

    ARC-Scheduler-Arena
    package version: 1.0.0
    commit: 0adf31715ae40aec6a93e15021c114e13241ad35

---

# 6. Create clean backend environment configuration

Copy the example:

macOS/Linux:

    cp .env.example .env

Windows PowerShell:

    Copy-Item .env.example .env

Generate a disposable local Django secret:

    python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

Generate a disposable local field-encryption key:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Place them into:

    SECRET_KEY=
    ARC_FIELD_ENCRYPTION_KEY=

These values are local validation secrets only.

Never copy a real deployed secret into a test clone unless that specific environment requires it.

---

# 7. Create a separate PostgreSQL validation database

Do not use the normal development database if the purpose is clean-room validation.

Example validation database:

    arc_pr_validation

On macOS/Linux with a local PostgreSQL role:

    createdb arc_pr_validation

Use:

    DATABASE_URL=postgres:///arc_pr_validation

For password-authenticated PostgreSQL, create a suitable test database and use the corresponding URL.

The validation database should be disposable.

Do not point the test clone at a production database.

---

# 8. Validate the database from zero

With `.venv` active:

    python manage.py check

Then migrate the empty database:

    python manage.py migrate --noinput

This is an important reproducibility test.

It proves the committed migration chain can construct the current schema without relying on an old developer database.

Check that no model changes are missing migrations:

    python manage.py makemigrations --check --dry-run

Expected result:

    No changes detected

Optional demo data:

    python manage.py seed_demo

Use demo data if needed for interactive browser testing.

---

# 9. Run backend automated validation

For broad validation:

    python -m pytest

For a Timeline/scheduler-focused release check, include the Timeline interaction, scheduling, scheduler settings, scheduler adapter/cutover, history, anchor, duration/progress and scheduler-authority suites under `backend/planning/tests/`.

The important rule is not merely that a test passes.

A test failure should be investigated as evidence of an implementation, test or environment problem. Do not add production hacks whose only purpose is making a test green.

---

# 10. Frontend clean setup

Open a separate terminal.

Enter:

    cd frontend

Install exactly from the committed lockfile:

    npm ci

Create the local Vite environment:

macOS/Linux:

    cp .env.example .env.local

Windows PowerShell:

    Copy-Item .env.example .env.local

Use:

    VITE_API_BASE_URL=http://127.0.0.1:8000/api

---

# 11. Run frontend automated validation

Run:

    npm run lint
    npm run build

For Timeline work:

    node --test src/features/timeline/timelineActions.test.js
    node --test src/features/timeline/timelineRendering.test.js

The production build command should complete successfully.

Note that:

    npm run dev

starts the Vite development server.

It is not the same thing as:

    npm run build

A complete validation should normally perform both:

- `npm run build` to prove a production bundle can be generated;
- `npm run dev` for interactive browser testing.

---

# 12. Start the clean backend server

In the backend terminal:

    python manage.py runserver

Expected address:

    http://127.0.0.1:8000/

Watch the log while testing.

Healthy request sequences may include:

    OPTIONS /api/...
    GET /api/...
    POST /api/...
    PUT /api/...

Authenticated Timeline use commonly reads:

    /api/planning/items/tree/
    /api/planning/items/history-status/
    /api/planning/timeline/navigation/
    /api/planning/timeline/

Scheduler interactions commonly include:

    /api/planning/scheduler/settings/
    /api/planning/timeline/reschedule/

A request returning `401` when an access token has expired can be expected if the frontend then successfully refreshes authentication and resumes normal requests.

An isolated development-server `Broken pipe` line is not automatically a functional defect. Treat it as significant when it corresponds with a visible failed action, repeated network failure or backend exception.

---

# 13. Start the asynchronous scheduler worker

Open a third terminal in the same clean validation checkout.

From `backend/`, activate the virtual environment and run:

    python manage.py run_scheduler_worker

Keep this process running throughout interactive validation.

The Django HTTP process commits canonical changes and durable scheduling
requests. The worker computes and publishes the disposable schedule
independently. Without the worker, scheduling requests remain pending.

To verify the asynchronous boundary:

1. Stop the idle worker with Ctrl+C.
2. Create or modify a planning item in the browser.
3. Confirm that the canonical edit succeeds without waiting for scheduling.
4. Confirm that the schedule remains pending while the worker is stopped.
5. Restart the worker.
6. Confirm that the pending request is processed and the Timeline updates.

Run migrations before starting a worker version that requires new schema
fields. Production deployments must supervise the worker separately from
the Django HTTP service and restart it after unexpected termination.

This guide validates application behaviour locally. Production service
configuration and deployment security are handled separately.

---

# 14. Start the clean frontend server

In the frontend terminal:

    npm run dev

Expected address:

    http://localhost:5173/

Vite may print dependency optimization on first startup.

During active editing it may print HMR updates. In a clean validation clone with no source edits, those should be minimal.

---

# 15. Browser live-test checklist

Use the clean clone only.

## Authentication

Confirm:

- login works;
- MFA flow works where applicable;
- refresh behavior does not leave the app stuck unauthorized;
- protected planning endpoints become available after authentication.

## Planner

Confirm:

- the planner tree loads;
- hierarchy data is visible;
- existing planning items can be opened;
- normal planner operations still behave correctly;
- priority-related UI is intact.

## Timeline base view

Confirm:

- Timeline loads without console-breaking errors;
- visible dates align correctly;
- horizontal and vertical scrolling work;
- cards are positioned at their intended dates;
- task cards retain correct duration rendering;
- constraint markers/lines align with their dates;
- offscreen constraint references behave correctly;
- current-week presentation is correct.

## Timeline search and navigation

Confirm:

- live search returns expected items;
- title/description/tags/type/duration search works;
- completed-item inclusion toggle changes the search universe correctly;
- next/previous result navigation works;
- keyboard navigation works;
- navigation can move to results outside the currently visible Timeline window.

## Completion behavior

Confirm:

- completing an item updates immediately in the UI;
- completed items remain displayed at their completed Timeline presentation date;
- reopening an item behaves correctly;
- rapid checkbox changes do not corrupt final state;
- splittable tasks preserve confirmed progress rules.

## Anchors

Confirm:

- anchor count is correct;
- anchor navigation works;
- clicking/dragging an anchor uses the expected conflict decisions;
- remove-anchor behavior works;
- blocked/deadline/release/capacity conflicts show the intended decision path.

## Scheduler mode

Confirm both flavours:

    lock-in
    monk

For each relevant scheduler flow:

- scheduler settings load;
- changing flavour persists the new flavour first;
- flavour change triggers rescheduling;
- the visible schedule refreshes;
- the scheduler button reschedules using the configured flavour;
- runtime state does not mutate canonical planning facts.

## Scheduler animation

Confirm:

- ordinary hover uses the calm hover aura;
- scheduling uses the active scheduling aura;
- approximately 40% of blobs can pass in front of the character only during scheduling;
- hover blobs remain behind the character;
- when scheduling finishes:
  - if the pointer is still hovering, state becomes hover;
  - otherwise it returns directly to idle;
- there is no stale cooldown animation;
- reduced-motion behavior remains respected.

## Overload/infeasible behavior

Confirm:

- overload status is displayed when appropriate;
- infeasible state is not hidden;
- relevant navigation works;
- issue labels resolve human-readable task titles rather than raw IDs where supported.

## Timezone controls

Confirm:

- timezone controls open and persist correctly;
- displayed Timeline dates remain coherent after timezone changes.

---

# 16. Browser developer-tools checks

While live testing, inspect the browser console and network panel.

Look for:

- unexpected uncaught exceptions;
- failed module loads;
- repeated `500` responses;
- unexpected permanent `401` loops;
- missing asset requests;
- bad API URLs;
- repeated scheduler requests that should only happen once.

Do not treat normal CORS preflight `OPTIONS` requests as failures.

---

# 17. Contract verification

A passing UI is not enough if the implementation violates architectural ownership.

For Timeline/scheduler work, review:

    docs/contracts/scheduler.md
    docs/contracts/timeline.md

Confirm the live behavior still respects the documented boundaries.

In particular:

- the scheduler may replace disposable schedule output;
- the scheduler must not silently become owner of hierarchy, dependencies, canonical priority, release/start dates, deadlines, manual requested dates or confirmed progress;
- presentation-only Timeline history must stay presentation-only;
- progress reopening must respect confirmed-progress invariants;
- deterministic scheduler behavior must be preserved;
- future changes must not silently weaken those contracts.

---

# 18. File and repository checks

Before declaring the revision ready:

    git status

The clean validation clone should remain clean except for intentionally local ignored files such as:

- `.env`
- `.env.local`
- `.venv`
- `node_modules`
- generated build output
- local database/test state

Check the actual review branch for:

- committed migrations;
- committed required image assets;
- updated documentation;
- no `.DS_Store`;
- no local `.env`;
- no real secrets;
- no machine-specific absolute paths.

---

# 19. Clean up validation state

When finished, stop the Django backend, scheduler worker and frontend development server.

Drop the disposable validation database.

Example:

    dropdb arc_pr_validation

The validation folder itself may be deleted when no longer needed.

Do not delete the developer's normal ARC database as part of this cleanup.

---

# 20. Pass criteria before PR or release handoff

The implementation is ready for handoff only when all relevant points are true:

- exact intended commit is pushed;
- clean remote clone succeeds;
- fresh backend environment installs;
- pinned scheduler installs;
- empty PostgreSQL database migrates from zero;
- migration consistency passes;
- backend tests pass;
- frontend installs using `npm ci`;
- frontend tests pass;
- frontend lint has no blocking errors;
- frontend production build succeeds;
- the Django backend, scheduler worker and frontend development server all start from the clean clone;
- manual browser checks pass;
- no missing assets or source files appear;
- authentication works;
- Timeline/scheduler live behavior matches the frozen contracts;
- validation does not rely on the original working directory.

At that point, prepare or open the pull request into `main`.

Do not merge merely because the branch builds. The clean-clone and manual live test exist to prove that the branch actually works as another ARC developer will receive it.
