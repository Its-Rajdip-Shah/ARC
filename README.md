# ARC

ARC is a university workload planner. A student owns a hierarchy of goals, tasks and assignments, a global priority order, a timeline that distinguishes real Canvas deadlines from ARC-suggested dates, and a Canvas import that never invents missing LMS data.

This repository is a monorepo: Django REST API in `backend/`, React SPA in `frontend/`.

- Design decisions: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Functional requirements mapped to code and tests: [`FR_TRACEABILITY.md`](FR_TRACEABILITY.md)

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | React 19, Vite, Tailwind CSS v4, React Router, Zustand, TanStack Query, Axios |
| Backend | Django 6.1.1, Django REST Framework, SimpleJWT, pyotp (TOTP MFA) |
| Database | PostgreSQL (required; SQLite cannot express the deferred unique constraint used for priority reorder) |
| Integrations | Canvas REST API (`/users/self`, courses, assignments only) |

Why these choices exist is documented in [ARCHITECTURE.md — Tech stack justification](ARCHITECTURE.md#tech-stack-justification).

## What it does

Students plan coursework without mixing another user's data into their tree. Staff (privileged operators, not developers) sign in on a **custom** console to review platform health and lock accounts. The product never links to Django's built-in `/admin/`.

### Student planner

| Capability | Requirement |
| --- | --- |
| Register, enrol TOTP, two-step login | [FR-01](FR_TRACEABILITY.md#fr-01--account-registration-and-totp-enrolment), [FR-02](FR_TRACEABILITY.md#fr-02--two-step-login) |
| Strict per-user isolation | [FR-03](FR_TRACEABILITY.md#fr-03--user-data-isolation) |
| Connect Canvas and sync courses/assignments | [FR-04](FR_TRACEABILITY.md#fr-04--canvas-connection), [FR-05](FR_TRACEABILITY.md#fr-05--canvas-synchronisation) |
| Nested goals / tasks / assignments, cycle-safe moves | [FR-06](FR_TRACEABILITY.md#fr-06--hierarchy-and-cycle-detection) |
| Tags, search, cascade complete | [FR-07](FR_TRACEABILITY.md#fr-07--tags), [FR-08](FR_TRACEABILITY.md#fr-08--search-and-cascade-completion) |
| Dense global priority order | [FR-09](FR_TRACEABILITY.md#fr-09--global-priority-order) |
| Timeline, adaptive dates, overdue Recent/Backlog | [FR-10](FR_TRACEABILITY.md#fr-10--timeline), [FR-11](FR_TRACEABILITY.md#fr-11--adaptive-rescheduling), [FR-12](FR_TRACEABILITY.md#fr-12--overdue-recent-and-backlog) |
| Named date ranges (semesters, exam periods) | [FR-13](FR_TRACEABILITY.md#fr-13--contextual-timezones) |
| Marks without treating "unmarked" as zero | [FR-14](FR_TRACEABILITY.md#fr-14--marks) |

### Staff console

| Capability | Requirement |
| --- | --- |
| Separate admin login + MFA | [FR-15](FR_TRACEABILITY.md#fr-15--separate-administrator-entry) |
| Stats, user search, lock / unlock | [FR-16](FR_TRACEABILITY.md#fr-16--admin-stats-lock-and-unlock) |

Frontend wiring for the console is in [ARCHITECTURE.md — Custom staff console](ARCHITECTURE.md#custom-staff-console-not-django-admin). Isolation rules are restated in [ARCHITECTURE.md — Isolation](ARCHITECTURE.md#isolation-restated).

## Prerequisites

- Python 3.12+ (3.14 works with the project venv)
- Node.js 20+ and npm
- PostgreSQL, with a database (default name `arc_db`)
- Git
  - Required for normal repository use and because the ARC scheduler
    dependency is installed from a commit-pinned Git repository.

## Scheduler dependency reproducibility

The production scheduler is not copied into this repository.

The backend installs the authoritative `arc-scheduler` package from the exact
Git commit pinned in `backend/requirements.txt`.

Current frozen scheduler package:

    ARC-Scheduler-Arena
    commit 17b33d1db1a24dc96dbd9845a1bfe52290c7f5d4
    tag v1.0.0

Installing backend dependencies therefore retrieves the exact scheduler
implementation used by this branch:

    python -m pip install -r backend/requirements.txt

Do not replace the commit pin with an unpinned branch such as `main`.

Required contracts:

- `docs/scheduler_contract.md`
- `docs/timeline_contract.md`

Implementation references:

- `docs/scheduler.md`
- `docs/timelineview.md`

## First-time setup

### 1. Clone and branch

```powershell
git clone <repo-url>
cd arc
```

New work goes on `feature/<feature-name>`, not `main`. See [`AGENTS.md`](AGENTS.md).

### 2. Backend environment

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
copy .env.example .env
```

On macOS/Linux, use `python3 -m venv .venv`, `source .venv/bin/activate`, and `cp .env.example .env`.

Fill in `backend/.env` (never commit this file):

| Variable | Purpose |
| --- | --- |
| `SECRET_KEY` | Django secret. Generate with `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"` |
| `DEBUG` | `True` for local HTTP |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` |
| `DATABASE_URL` | `postgres://USER:PASSWORD@localhost:5432/arc_db` — percent-encode reserved characters in the password (`!` → `%21`) |
| `ARC_FIELD_ENCRYPTION_KEY` | Fernet key for TOTP secrets and Canvas tokens. Generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. Changing it later makes existing encrypted rows unreadable. |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` |
| `CANVAS_BASE_URL` | Institution Canvas host, no trailing `/api/v1` |

Create the Postgres database if needed (`CREATE DATABASE arc_db;`), then:

```powershell
python manage.py migrate
python manage.py seed_demo
```

`seed_demo` is optional. It creates local demo students plus `admin@example.com`. That admin **cannot log in until MFA is enrolled** (see [Admin accounts](#admin-accounts) below). Re-run with `--reset` to wipe and recreate those demo emails.

### 3. Frontend environment

```powershell
cd frontend
npm ci
copy .env.example .env.local
```

`frontend/.env.local` must contain:

```
VITE_API_BASE_URL=http://127.0.0.1:8000/api
```

No trailing `/api/v1`. Vite only exposes `VITE_*` variables.

## Verify a fresh local setup

After installing both sides and configuring environment files:

Backend:

    cd backend
    python manage.py check
    python manage.py makemigrations --check --dry-run
    python -m pytest

Frontend:

    cd frontend
    npm run lint
    npm run build
    node --test src/features/timeline/timelineActions.test.js
    node --test src/features/timeline/timelineRendering.test.js

For fresh clones, prefer `npm ci` over `npm install`; it installs exactly from
the committed `package-lock.json`.

### Backend environment

ARC requires PostgreSQL. SQLite is intentionally unsupported because ARC uses
database behaviour that SQLite cannot reproduce correctly.

Create your local environment file:

    cd backend
    cp .env.example .env

On Windows PowerShell:

    cd backend
    Copy-Item .env.example .env

Generate a Django secret:

    python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

Paste it after `SECRET_KEY=`.

Generate the ARC field-encryption key:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Paste it after `ARC_FIELD_ENCRYPTION_KEY=`.

Do not commit `backend/.env`.

#### PostgreSQL database

The default development database name is:

    arc_db

There are two normal local connection styles.

**macOS/Linux with a local PostgreSQL role matching your OS username**

For installations such as Homebrew PostgreSQL, this is often enough:

    createdb arc_db

Then use:

    DATABASE_URL=postgres:///arc_db

This uses the local PostgreSQL role associated with your operating-system user
and does not require storing a database password in `.env`.

**Password-authenticated PostgreSQL / Windows**

Create a developer role and database using a PostgreSQL administrator account.
For example, in `psql`:

    CREATE ROLE arc_dev WITH LOGIN PASSWORD 'choose-a-local-password';
    CREATE DATABASE arc_db OWNER arc_dev;

Then use:

    DATABASE_URL=postgres://arc_dev:YOUR_PASSWORD@localhost:5432/arc_db

If the password contains reserved URL characters, percent-encode them.

Each developer may use their own local PostgreSQL credentials. Database
credentials are machine-local and must never be committed.

After configuring the database:

    python manage.py migrate

Optional demo data:

    python manage.py seed_demo

The encryption key is different from the database password. Existing shared or
deployed databases must keep their original `ARC_FIELD_ENCRYPTION_KEY`, because
changing that key makes previously encrypted values unreadable.

### Do not create users in pgAdmin

The `users` table stores a Django **password hash** and a **Fernet-encrypted** TOTP secret. A handmade `INSERT` will not log in. pgAdmin is fine for inspecting `email`, `is_admin`, and `is_locked`. Do not edit `password_hash` or `totp_secret_encrypted` by hand.

### Create (or promote) a staff user in the Django shell

From `backend/` with the venv active and settings loading (you must **not** see `Automatic imports are disabled since settings are not configured`):

```powershell
python manage.py shell
```

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

- **secret** — add this to an authenticator app (issuer `ARC`), or keep it to generate codes in the shell.
- **code now** — the six digits for the **Authentication code** field. It changes every 30 seconds.

If the login page rejects the code as expired, print a fresh one (still in the venv):

```powershell
python -c "import pyotp; print(pyotp.TOTP('PASTE_SECRET_HERE').now())"
```

Then open http://localhost:5173/admin/login, enter the email and password, **Continue**, then the six digits, **Enter console**.

`seed_demo`'s `admin@example.com` / `arc-demo-pass-1234` still needs this MFA enrolment step. The same shell snippet works: set `email = "admin@example.com"` and the demo password, or only assign `totp_secret_encrypted` if the password is already set.

To promote an existing student (already MFA-enrolled) without rotating their TOTP:

```python
user = User.objects.get(email="student@example.com")
user.is_admin = True
user.save(update_fields=["is_admin"])
```

They then use `/admin/login` with their existing authenticator, not `/`.

### After you are in

- **Overview** (`/admin`) — counts only: people, locks, overdue items, Canvas sync health. No planner titles or tokens. See [FR-16](FR_TRACEABILITY.md#fr-16--admin-stats-lock-and-unlock).
- **Accounts** (`/admin/users`) — search by email, lock or restore. You cannot lock your own account.

An administrator cannot delete users from this console. Locking ends the target's live JWT on their next request (`ArcJWTAuthentication` re-reads `is_locked`).

## Tests

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pytest
python manage.py check
```

Frontend production build:

```powershell
cd frontend
npm run build
```

## Project layout

```
backend/          Django project (arc_backend), apps: core, accounts, planning,
                  canvas_integration, analytics
frontend/         Vite SPA
ARCHITECTURE.md   Why the system is shaped this way
FR_TRACEABILITY.md  FR-01 … FR-16 → endpoints, services, tests, React views
AGENTS.md         Stack and git conventions for this repo
```
