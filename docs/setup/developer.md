# ARC Developer Setup Guide

This guide is for ARC developers who want to get the repository into a state where they can:

- run ARC locally;
- make frontend or backend changes;
- live-test those changes;
- run the relevant checks before committing;
- update an existing local clone safely; or
- create a completely fresh local clone.

ARC is a monorepo with:

- a Django REST backend in `backend/`;
- a React/Vite frontend in `frontend/`;
- PostgreSQL as the required database;
- an external, commit-pinned scheduler package installed from `ARC-Scheduler-Arena`;
- technical and behavioral documentation in `docs/`. The map is `docs/README.md`. This file is the only day-to-day setup procedure. Clean-clone validation stays in `docs/setup/production.md`.

---

## 1. Prerequisites

Install these before starting:

- Git
- Python 3.12+
- Node.js 20+
- npm
- PostgreSQL
- a browser

ARC does not use SQLite as a supported development database.

The frontend package versions are locked by:

    frontend/package-lock.json

The backend scheduler implementation is locked by:

    backend/requirements.txt

At the current frozen scheduler boundary, ARC installs:

    ARC-Scheduler-Arena
    package version: 1.0.0
    commit: 0adf31715ae40aec6a93e15021c114e13241ad35

Do not replace that commit pin with an unpinned scheduler branch.

---

# 2. Choosing how to get the latest ARC code

There are two supported workflows.

## Option A — update an existing ARC clone

Use this when you already have ARC on your machine and want to bring it up to date.

First enter the repository:

    cd /path/to/arc

Check what branch you are currently on:

    git branch --show-current

Check whether you have local changes:

    git status

If you have work you want to keep, either commit it on your own feature branch or stash it before changing branches.

Fetch the latest remote state:

    git fetch origin

Switch to the branch you want to work from.

For example:

    git switch integration/scheduler-backend

Bring that branch up to date without creating an accidental merge commit:

    git pull --ff-only origin integration/scheduler-backend

Then refresh dependencies because the branch may have changed them:

Backend:

    cd backend
    source .venv/bin/activate
    python -m pip install -r requirements.txt

Windows PowerShell:

    cd backend
    .\.venv\Scripts\Activate.ps1
    python -m pip install -r requirements.txt

Apply any new migrations:

    python manage.py migrate

Frontend:

    cd ../frontend
    npm ci

`npm ci` is preferred over `npm install` for a clean reproducible dependency state because it installs exactly from `package-lock.json`.

Finally, run the verification steps in this guide before beginning new work.

---

## Option B — create a completely fresh ARC clone

Use this when:

- setting ARC up on a new machine;
- validating reproducibility;
- avoiding contamination from an old working copy;
- or starting from a known-clean repository state.

Clone the repository:

    git clone <ARC repository URL>
    cd arc

Fetch all branches if needed:

    git fetch origin

Switch to the branch you need:

    git switch integration/scheduler-backend

If Git has not created the local branch yet:

    git switch --track origin/integration/scheduler-backend

Confirm:

    git branch --show-current
    git status

You should now have a clean working tree before setup begins.

---

# 3. Repository structure

A high-level ARC tree looks like this:

    arc/
    ├── backend/
    │   ├── manage.py
    │   ├── requirements.txt
    │   ├── .env.example
    │   ├── planning/
    │   │   ├── models.py
    │   │   ├── serializers.py
    │   │   ├── urls.py
    │   │   ├── views.py
    │   │   ├── services/
    │   │   ├── migrations/
    │   │   └── tests/
    │   └── ...
    │
    ├── frontend/
    │   ├── package.json
    │   ├── package-lock.json
    │   ├── .env.example
    │   ├── src/
    │   │   ├── api/
    │   │   ├── assets/
    │   │   ├── features/
    │   │   │   ├── planner/
    │   │   │   └── timeline/
    │   │   ├── hooks/
    │   │   └── pages/
    │   └── ...
    │
    ├── docs/
    │   ├── README.md
    │   ├── setup/
    │   ├── contracts/
    │   ├── guides/
    │   ├── governance/
    │   ├── architecture/
    │   ├── security/
    │   └── reviews/
    │
    ├── README.md
    └── .gitignore

Important areas:

### `backend/planning/`

This is where planning-domain behavior lives.

Key surfaces include:

- `models.py` — persisted planning state;
- `serializers.py` — API representations and validation;
- `views.py` — planning API endpoints;
- `urls.py` — route registration;
- `services/` — domain operations such as hierarchy, progress, history and scheduling;
- `migrations/` — schema evolution;
- `tests/` — backend behavioral and contract tests.

### `frontend/src/features/planner/`

Planner-tree and priority UI.

### `frontend/src/features/timeline/`

Timeline View implementation, including:

- board/date rendering;
- task cards;
- search/navigation;
- anchors;
- timezone controls;
- scheduler controls;
- scheduler aura/animation;
- Timeline-specific actions and preferences;
- Timeline tests.

### `frontend/src/hooks/`

Shared frontend query/mutation hooks.

Examples include:

- `useSchedulerSettings.js`
- `useTimelineUniverse.js`

### `frontend/src/api/`

HTTP API client functions.

### `docs/`

Behavioral documentation and frozen contracts.

Before changing Timeline or scheduler semantics, read:

- `docs/guides/timeline.md`
- `docs/contracts/timeline.md`
- `docs/guides/scheduler.md`
- `docs/contracts/scheduler.md`

The files in `docs/contracts/` define rules future changes must preserve unless the contract itself is intentionally reviewed and changed. The matching files in `docs/guides/` describe the current implementation and do not override those contracts.

---

# 4. Backend setup

Enter the backend:

    cd backend

Create a virtual environment:

macOS/Linux:

    python3 -m venv .venv
    source .venv/bin/activate

Windows PowerShell:

    python -m venv .venv
    .\.venv\Scripts\Activate.ps1

Install dependencies:

    python -m pip install -r requirements.txt

This also installs the commit-pinned ARC scheduler package from Git.

---

# 5. Backend environment configuration

Create your local environment file:

macOS/Linux:

    cp .env.example .env

Windows PowerShell:

    Copy-Item .env.example .env

Never commit `backend/.env`.

Generate a Django secret:

    python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

Paste the result into:

    SECRET_KEY=

Generate the ARC field-encryption key:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Paste the result into:

    ARC_FIELD_ENCRYPTION_KEY=

Important:

- every developer may use their own keys locally;
- do not commit them;
- do not casually replace the encryption key for an existing shared database, because encrypted stored values would become unreadable.

---

# 6. PostgreSQL setup

ARC requires PostgreSQL.

The default local database name is:

    arc_db

## macOS/Linux local-role setup

If your operating-system username is also a PostgreSQL role, a common setup is:

    createdb arc_db

Then use:

    DATABASE_URL=postgres:///arc_db

## Password-authenticated setup

Using a PostgreSQL administrator account, create a local developer role and database:

    CREATE ROLE arc_dev WITH LOGIN PASSWORD 'choose-a-local-password';
    CREATE DATABASE arc_db OWNER arc_dev;

Then use:

    DATABASE_URL=postgres://arc_dev:YOUR_PASSWORD@localhost:5432/arc_db

If a password contains URL-reserved characters, percent-encode them.

---

# 7. Apply backend migrations

With the backend venv active:

    python manage.py migrate

Optional demo data:

    python manage.py seed_demo

The demo seed is useful for local development, but it is not required merely to run the application.

`seed_demo`'s `admin@example.com` / `arc-demo-pass-1234` cannot log in until MFA is enrolled. Do not insert users by hand in pgAdmin: `users` stores a Django password hash and a Fernet-encrypted TOTP secret. pgAdmin is fine for inspecting `email`, `is_admin`, and `is_locked`.

### Create or promote a staff user

From `backend/` with the virtual environment active:

    python manage.py shell

```python
import pyotp
from django.contrib.auth import get_user_model

User = get_user_model()
email = "you@example.com"              # replace
password = "pick-a-strong-password"    # replace

user, created = User.objects.get_or_create(
    email=email,
    defaults={"is_admin": True},
)
user.set_password(password)
user.is_admin = True
user.is_locked = False

secret = pyotp.random_base32()
user.totp_secret_encrypted = secret
user.save()

print("created:" if created else "updated:", user.email)
print("secret:", secret)
print("code now:", pyotp.TOTP(secret).now())
```

Add **secret** to an authenticator app (issuer `ARC`). **code now** is the six-digit authentication code and changes every 30 seconds. If login rejects it as expired:

    python -c "import pyotp; print(pyotp.TOTP('PASTE_SECRET_HERE').now())"

Then open http://localhost:5173/admin/login. To promote an existing student who already has an authenticator, set `is_admin = True` and save `update_fields=["is_admin"]` without rotating the TOTP secret. They use `/admin/login`, not `/`.

Django's built-in `/admin/` stays off unless `ENABLE_DJANGO_ADMIN=True`. Staff use the React console. Overview (`/admin`) shows counts only. Accounts (`/admin/users`) can lock or restore another user, never your own. Locking ends that user's live JWT on the next request.

---

# 8. Frontend setup

Open a new terminal and enter:

    cd frontend

Install exactly from the lockfile:

    npm ci

Create the local frontend environment file:

macOS/Linux:

    cp .env.example .env.local

Windows PowerShell:

    Copy-Item .env.example .env.local

The local API base should be:

    VITE_API_BASE_URL=http://127.0.0.1:8000/api

Do not append `/api/v1`.

---

# 9. Start ARC for live development

Use three terminals. The scheduler worker is required: the API deliberately
acknowledges canonical changes before their disposable Timeline projection is
computed, so running only Django and Vite leaves scheduling permanently
pending.

## Terminal 1 — backend

From `backend/` with `.venv` active:

    python manage.py runserver

Expected local backend:

    http://127.0.0.1:8000/

Normal Django development logs will show API requests such as:

    GET /api/planning/timeline/
    GET /api/planning/timeline/navigation/
    POST /api/planning/timeline/reschedule/

A temporary `401` followed by a successful token refresh can be normal when an access token expires.

An isolated development-server `Broken pipe` message can occur when a browser cancels or closes a connection; investigate only if it corresponds to visible broken behavior or repeated request failures.

## Terminal 2 — scheduler worker

From `backend/` with `.venv` active:

    python manage.py run_scheduler_worker

Use `python manage.py run_scheduler_worker --once` to process one bounded
batch while debugging. Run exactly one worker locally unless deliberately
testing PostgreSQL concurrency; revision-checked publication makes duplicate
delivery safe, but it does not replace the worker process.

## Terminal 3 — frontend

From `frontend/`:

    npm run dev

Expected Vite URL:

    http://localhost:5173/

During development, Vite will print HMR updates when source files change. That is normal.

---

# 10. Making changes

Before editing:

    git status
    git branch --show-current

Work on a feature branch, not `main`.

Typical flow:

    git switch -c feature/my-change

Make the change.

Live-test it using the running Django and Vite servers.

Then run the appropriate checks.

---

# 11. Verification before committing

## Backend

From `backend/` with `.venv` active:

    python manage.py check
    python manage.py makemigrations --check --dry-run
    python -m pytest

`python -m pytest` prints coverage for `accounts`, `planning`, `canvas_integration`, `analytics`, and `core`. Migrations, tests, and management commands are excluded. Models, views, and services are expected to stay around 85% or better.

If your work is specifically Timeline/scheduler related, the relevant focused suites include the Timeline interaction, scheduler, history, progress, anchor and scheduler-authority tests under `backend/planning/tests/`.

## Frontend

From `frontend/`:

    npm run lint
    npm run build

Timeline-focused tests:

    node --test src/features/timeline/timelineActions.test.js
    node --test src/features/timeline/timelineRendering.test.js

The real-browser Timeline layout test is optional and requires:

    TIMELINE_BROWSER_TESTS=1
    CHROME_BIN=<path-to-a-Chromium-compatible-browser>

---

# 12. Working with migrations

If you intentionally change Django models:

    python manage.py makemigrations

Review the generated migration.

Then:

    python manage.py migrate
    python manage.py makemigrations --check --dry-run

Do not manually invent schema state that is not represented by migrations.

A teammate cloning ARC should be able to create an empty database and reach the current schema solely by running:

    python manage.py migrate

---

# 13. Updating frontend dependencies

Do not edit `package-lock.json` by hand.

If you intentionally add or update a package:

    npm install <package>

Then commit both:

- `package.json`
- `package-lock.json`

For ordinary setup or refresh of an existing branch, use:

    npm ci

---

# 14. Updating backend dependencies

Backend direct dependencies are in:

    backend/requirements.txt

If changing the scheduler package, preserve the project rule that the production scheduler must be pinned to an exact Git commit unless the scheduler contract is intentionally changed.

After any dependency update, validate from a fresh virtual environment.

---

# 15. Timeline and scheduler change rules

Timeline and scheduler changes have stronger behavioral constraints than ordinary UI refactors.

Read before modifying them:

    docs/contracts/timeline.md
    docs/contracts/scheduler.md

Examples of important boundaries include:

- the scheduler owns disposable scheduling output, not canonical planning facts;
- canonical hierarchy, dependencies, priority and confirmed progress are not scheduler-owned;
- Timeline presentation history must not silently become scheduler input;
- deterministic scheduler behavior and frozen flavour semantics must be preserved;
- frontend optimistic behavior must eventually reconcile with authoritative backend state.

Do not make a production-code change only to make a test green. Fix the actual behavior or architecture problem and use tests to prove the fix.

---

# 16. Common local-development issues

## Backend starts but API calls return `401`

Check whether:

- you are logged in;
- access-token refresh succeeded;
- the frontend is using the intended backend URL.

## Django cannot connect to PostgreSQL

Check:

- PostgreSQL is running;
- the database exists;
- the PostgreSQL role exists;
- `DATABASE_URL` is correct;
- password characters are percent-encoded when necessary.

## `SECRET_KEY` error on startup

Your local `.env` still has an empty `SECRET_KEY`.

Generate one using the command in this guide.

## Encryption-key error

Generate `ARC_FIELD_ENCRYPTION_KEY` using Fernet as shown above.

## Frontend cannot reach backend

Check:

    VITE_API_BASE_URL=http://127.0.0.1:8000/api

Also check the backend CORS configuration in `.env`.

## Frontend dependency state looks strange

Remove the generated dependency tree and reinstall from lock:

    rm -rf node_modules
    npm ci

## Python dependency state looks strange

Recreate the venv:

    rm -rf .venv
    python3 -m venv .venv
    source .venv/bin/activate
    python -m pip install -r requirements.txt

---

# 17. Recommended clean-room validation

Before a major PR, release checkpoint or scheduler/Timeline freeze, validate the exact pushed branch in a separate folder.

Example flow:

    cd /some/other/parent/folder
    git clone <ARC repository URL> arc-validation
    cd arc-validation
    git switch --track origin/<branch>

Then perform the backend and frontend setup from scratch.

This catches hidden dependencies on:

- old virtual environments;
- old `node_modules`;
- ignored local files;
- an already-migrated database;
- machine-specific paths;
- files that were never committed.

After setup, launch both servers and manually exercise the changed workflows.

This clean-room workflow should be preferred before merging substantial changes into `main`.

---

# 18. Before opening a pull request

Confirm:

    git status
    git diff --check

Make sure:

- the working tree is clean;
- all intended assets are tracked;
- `.env`, `.env.local`, `.venv`, `node_modules`, databases and `.DS_Store` are not committed;
- migrations are committed;
- docs match the current behavior;
- backend checks/tests pass;
- frontend tests/lint/build pass;
- the exact pushed branch has been manually live-tested from a fresh clone.

Then open the pull request into `main`.
