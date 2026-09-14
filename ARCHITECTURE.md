# ARC architecture

ARC is a university workload planner: a student owns a hierarchy of goals, tasks and assignments, a global priority order, a timeline that distinguishes real deadlines from ARC-suggested dates, and a Canvas import that must never invent missing LMS data.

This document records the technical decisions from Phase 0 through Phase 7, and why they look the way they do in the code. Requirement-by-requirement mapping lives in [`FR_TRACEABILITY.md`](FR_TRACEABILITY.md).

## System shape

```
frontend/          React 19 + Vite + Tailwind CSS v4
  src/lib/         Axios client, QueryClient, TOTP helper
  src/stores/      Zustand auth store
  src/api/         Thin wrappers over /api/*
  src/hooks/       TanStack Query hooks

backend/          Django 6.1.1 + DRF + PostgreSQL
  core/            Shared isolation, encryption, errors, pagination
  accounts/        Custom User, MFA, JWT
  planning/        Hierarchy, priority, scheduling, overdue, marks
  canvas_integration/  Canvas client + upsert sync
  analytics/       Admin stats, lock/unlock
```

The monorepo split is deliberate. The domain rules (cycles, priority density, adaptive roll-forward, tenant isolation) are HTTP-free Python services. The API is a thin translation of those services into JSON. The SPA never implements a business rule that the backend does not already enforce.

---

## Tech stack justification

### Django and Django REST Framework

The product is a permissioned CRUD API over a 3NF schema, with a handful of non-trivial invariants (no cycles, dense unique positions, user-scoped foreign keys). Django gives us:

- A custom user model that matches the ERD (`email`, `is_admin`, `is_locked`, encrypted TOTP secret) without dragging in `PermissionsMixin`'s extra columns.
- Migrations as the source of truth for constraints, including Postgres-only deferrable uniques.
- DRF viewsets, so the wireframe screens (Text View, Priority View, Timeline, Marks, Admin) map onto named routes rather than ad-hoc handlers.
- A single exception envelope (`core.exceptions.arc_exception_handler`) so the frontend interceptor never has to guess whether an error is a string, a list, or a field dict.

"Rapid secure routing" here means: default `IsAuthenticated`, a project-wide `ArcJWTAuthentication`, and `UserScopedMixin` on every owned viewset. A new resource cannot accidentally become public; it has to opt *out*.

### PostgreSQL

SQLite cannot express `DEFERRABLE INITIALLY DEFERRED` unique constraints, which FR-09's bulk reorder depends on. Postgres also gives us:

- Recursive CTEs for hierarchy walks in one round-trip (`planning/queries.py`).
- `NULL`s treated as distinct in unique indexes, so any number of completed tasks can sit at `priority_position = NULL` without a partial index that would forbid deferral.
- Check constraints (`planning_item_no_self_parent`, `timezone_end_not_before_start`) as a backstop the ORM cannot skip.

Relational integrity is the product: a tag cannot attach to another user's item, a Canvas object cannot duplicate per user, a timezone cannot end before it starts. Those are table constraints, not application hopes.

### React, Vite and Tailwind CSS v4

The wireframes are a single authenticated SPA with several coordinated views over the same planning tree. React + Vite is the shortest path to that, with Tailwind v4 (`@tailwindcss/vite`) for the dark, dense UI without a separate CSS pipeline. TanStack Query owns server state (30s `staleTime`, no retry on 4xx). Zustand owns the session. React Router is present for Phase 7+ routing; Phase 6 only needed the API bridge and a ping screen.

### Canvas REST API

Students already have their assessments in Canvas. Inventing due dates or weightings would put guesses into the planner, which the project rules forbid. The client (`canvas_integration/client.py`) wraps only `/users/self`, `/courses` and `/courses/{id}/assignments`. Missing `due_at` becomes an adaptive item (FR-11). `points_possible` is *not* a unit weighting, so `weight_percent` stays null for the student to fill in (FR-14). Re-sync upserts on `(user, canvas_object_type, canvas_object_id)` rather than inserting duplicates (FR-05).

---

## Phase 0–1 — Core scaffolding

Phase 0 existed because `settings.py` had been gitignored while a tracked `.pyc` still contained `SECRET_KEY` and the database password. Secrets moved into `backend/.env` via `django-environ`, `settings.py` and `.env.example` became tracked, and `__pycache__` / `.env` were properly ignored. `ARC_FIELD_ENCRYPTION_KEY` is a Fernet key used by `core.fields.EncryptedCharField` for TOTP secrets and Canvas tokens. That field refuses content lookups (`exact`, `gt`, …) because ciphertext is non-deterministic; counting MFA-enrolled users therefore tests ciphertext *length*, not equality (`UserQuerySet.mfa_enrolled`).

Phase 1 introduced the `core` app as the only place isolation primitives live, so domain apps cannot each invent a slightly different "filter by user".

### `OwnedModel`

```python
class OwnedModel(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        db_column='user_id',
        related_name='%(class)ss',
    )
    class Meta:
        abstract = True
```

Every owned table (`tags`, `planning_items`, `timezones`, `sync_logs`) carries `user_id`. Isolation is then a `WHERE user_id = :request_user` predicate, not a join you might forget. `on_delete=CASCADE` matches the ERD: deleting an account removes its planner. `AssignmentDetail` is the exception — it shares a primary key with `PlanningItem` and reaches the owner through `planning_item__user`.

This is "mathematical" in the sense that the tenant key is a column on the row. There is no shared table of items with a later permission check; a row that is not yours is not in your relation.

### `UserScopedMixin`

Queryset scoping is the read-side enforcement:

```python
return queryset.filter(**{self.user_field: user})
```

A foreign primary key therefore 404s rather than 403s, so the API never confirms that another user's object exists. `perform_create` stamps `user=request.user`, so a client cannot create a row for someone else.

That is necessary and not sufficient. A POST body that names `{ "parent": <alice's id> }` would still resolve Alice's title through an unscoped `PrimaryKeyRelatedField`. `UserScopedPrimaryKeyRelatedField` filters the *related* queryset the same way, so write-path foreign keys fail as "does not exist". Isolation is then:

| Layer | What it stops |
| --- | --- |
| `OwnedModel.user` | Rows without an owner |
| DB unique/check constraints | Duplicate positions, self-parent, duplicate Canvas ids |
| `UserScopedMixin` | Reading another tenant's rows |
| `UserScopedPrimaryKeyRelatedField` | Naming another tenant's rows in a payload |
| Recursive CTEs scoped by `user_id` | Walking into another tenant's tree |

`core` also ships `EncryptedCharField`, `IsOwner` / `IsAdminAccount`, the `{error: {code, message, fields}}` envelope, and `ArcPageNumberPagination` (50 / max 200).

---

## Phase 2 — Database design

The eight ERD tables map onto Django models with ERD column names via `db_table` / `db_column`:

| ERD | Model | Notes |
| --- | --- | --- |
| User | `accounts.User` (`AbstractBaseUser`, no `PermissionsMixin`) | `is_staff` / `is_superuser` derived from `is_admin` |
| CanvasConnection | `canvas_integration.CanvasConnection` | `OneToOneField` to User; encrypted token |
| SyncLog | `canvas_integration.SyncLog` | Owned; SUCCESS/FAILED check constraint |
| PlanningItem | `planning.PlanningItem` | Self-FK `parent`; goals/tasks/assignments in one table |
| AssignmentDetail | `planning.AssignmentDetail` | PK = `planning_item_id` (1-to-0..1) |
| Tag | `planning.Tag` | Unique `(user, name)` |
| PlanningItemTag | `planning.PlanningItemTag` | Explicit through model |
| Timezone | `planning.Timezone` | Named date range; overlap allowed |

### Deferred unique constraint for FR-09

Active tasks hold a dense `priority_position` 1..n per user. Reordering "move D to position 1" is a permutation: several rows must swap numbers. An *immediate* unique constraint on `(user, priority_position)` rejects the intermediate states of a `bulk_update`.

The usual workaround is an offset shuffle (add 1_000_000, then write the real numbers). Postgres can defer the check until `COMMIT`:

```python
models.UniqueConstraint(
    fields=['user', 'priority_position'],
    name='uniq_user_priority_position',
    deferrable=models.Deferrable.DEFERRED,
)
```

`planning.services.priority.reorder` therefore locks the user row (`select_for_update`), rewrites positions in memory, and `bulk_update`s once. Duplicates exist only inside the transaction. NULL positions are excluded by Postgres NULL-distinct semantics, so completed items do not need a partial unique index — and a `condition=` would have made the constraint non-deferrable.

The constraint is proven in `planning/tests/test_priority.py` by forcing `SET CONSTRAINTS ALL IMMEDIATE` and expecting `IntegrityError`.

---

## Phase 3 — Security and MFA

Authentication is stateless JWT (SimpleJWT) plus TOTP (`pyotp`). There is no server session. The access token lives 30 minutes; refresh lasts 7 days and rotates (`ROTATE_REFRESH_TOKENS`, `BLACKLIST_AFTER_ROTATION`).

### Two-step flow

1. `POST /api/auth/register/` creates the user but **does not** store the TOTP secret. The secret rides in a short-lived `MFAEnrolmentToken`. Abandoned registrations cannot log in.
2. `POST /api/auth/mfa/enroll/confirm/` proves the authenticator and then encrypts the secret onto the user.
3. `POST /api/auth/login/` checks email/password and returns an `mfa_pending` token (five minutes, `scope != full`).
4. `POST /api/auth/login/mfa/` verifies TOTP (with cache-backed replay protection) and returns a full access/refresh pair with `scope=full`.

`ArcJWTAuthentication` rejects any access token whose `scope` is not `full`, so a stolen pending token is not a session. It also re-reads `user.is_locked` on every request, so FR-16's lock ends a live session immediately rather than at access-token expiry.

Admin login is a separate pair of URLs (`/api/auth/admin/login/` and `/login/mfa/`). A pending token from one flow cannot be redeemed on the other (`admin_login` claim).

### Anti-enumeration

`LoginView` checks credentials **before** `is_locked`, `is_admin`, or MFA enrolment:

```python
if user is None or not user.check_password(password):
    raise AuthenticationFailed(..., code='invalid_credentials')
```

A wrong password therefore cannot be used to discover whether an email is registered or whether the account is locked. Locked and "not an administrator" only surface after a correct password.

TOTP codes are remembered in the cache for the validity window so the same six digits cannot be replayed.

### `PublicAuthView` and HTTP 401

Public auth views set `authentication_classes = []` so a stale Bearer token does not block a new login. DRF, however, downgrades `AuthenticationFailed` from 401 to 403 when no authenticator supplies a `WWW-Authenticate` header. `PublicAuthView.get_authenticate_header` returns `Bearer realm="api"`, which keeps wrong passwords and bad TOTPs as **401**. The Axios interceptor keys off 401; 403 would have skipped refresh and shown a permission error on login.

---

## Phase 4 — Domain logic

Services live in `planning/services/` and do not import DRF. Views call them; tests call them directly.

### Recursive CTEs

Walking `parent_id` in Python is one query per level. `planning/queries.py` uses `WITH RECURSIVE` instead, always predicated on `user_id`, with `MAX_DEPTH = 100` so a cycle that somehow reached the database cannot hang a request.

| Helper | Used by |
| --- | --- |
| `ancestor_ids` | FR-06 cycle check (`validate_parent` walks *up* from the proposed parent; illegal iff the moving item appears in that chain) |
| `descendant_ids` | FR-08 cascade complete |
| `tree_rows` | Text View: one CTE for order+depth, nest in memory |
| `parent_map` / `root_of` | Timeline, priority grouping, overdue paths — one load of `(id, parent_id)` then in-memory walks |

Self-parent is also a check constraint. Deeper cycles are an application rule because SQL check constraints cannot recurse.

### Adaptive scheduling (FR-11)

Items with no `due_date` are adaptive. They carry a provisional `scheduled_date`. The daily sweep `roll_forward_adaptive(user, today)`:

1. Sets missing dates to `today`.
2. Moves stale dates to `max(scheduled_date + 1 day, today)` so a week of downtime does not require seven runs.
3. Within each root, walks priority order and pushes collisions forward.

It writes `scheduled_date` and nothing else. `due_date` is never touched; only a real deadline can become overdue (FR-12: Recent ≤ 7 days, Backlog > 7). The sweep is idempotent for a given `today`, and the first timeline read of the day runs it if a cron job has not.

---

## Phase 5 — REST API

Mounted under `/api/`:

| Prefix | Role |
| --- | --- |
| `/api/auth/` | Register, MFA, login, refresh, logout, me |
| `/api/planning/` | Items (tree/move/complete), tags, timezones, assignment-details, priority, timeline, overdue, marks |
| `/api/canvas/` | Singleton connection, test, sync, sync-logs |
| `/api/admin/` | Stats, users, lock/unlock (`IsAdminAccount`) |
| `/api/schema/`, `/api/docs/` | OpenAPI + Swagger UI |

Viewsets inherit `UserScopedMixin`. Custom actions delegate to Phase 4 services. `PlanningItemSerializer` treats `priority_position`, `scheduled_date` and Canvas linkage as read-only: clients cannot forge the global order or an adaptive date.

### Canvas upsert

`update_or_create` on `(user, canvas_object_type, canvas_object_id)`:

- Course → root `GOAL`.
- Assignment → child `ASSIGNMENT` plus `AssignmentDetail` (submission URL only).
- Canvas HTTP happens *outside* the write transaction so a slow LMS does not hold row locks.
- Local completion, tags, marks and priority survive a re-sync.
- Failures still insert a `SyncLog` (`FAILED`), which is what the Connection screen displays.

### drf-spectacular

`DEFAULT_SCHEMA_CLASS = AutoSchema`. `core.schema.ArcJWTScheme` teaches Spectacular about `ArcJWTAuthentication` so Swagger's Authorize button sends a bearer token. Public views declare `serializer_class` / `@extend_schema` so they are not dropped from the schema. `manage.py spectacular --fail-on-warn` is part of the Phase 5 gate.

---

## Phase 6 — Frontend bridge

### Zustand memory store

`src/stores/authStore.js` keeps `accessToken` in memory and persists only `refreshToken` (`partialize`). A stolen `localStorage` dump is not a session; it can at best mint a new access token, which still needs the refresh secret and is rotated on use. `user` is in-memory too.

### Axios interceptors

`src/lib/apiClient.js` points at `import.meta.env.VITE_API_BASE_URL` (markdown-shaped values are tolerated). The request interceptor attaches `Authorization: Bearer <accessToken>` when one exists.

The response interceptor, on **401**:

1. Ignores login/register/MFA/refresh/health — those 401s are business answers, not expired sessions.
2. Ignores requests already retried (`_retry`) to prevent loops.
3. Requires a refresh token; otherwise rejects.
4. Runs **one** in-flight refresh (`singleFlightRefresh`) on a bare Axios instance that has no interceptors, so SimpleJWT's 401 cannot re-enter.
5. Queued callers await that same promise, then replay with the new access token.
6. On refresh failure: `clearSession()` and `window.location.assign('/login')`.

TanStack Query (`staleTime: 30_000`) does not retry 4xx, so a real 401 after a failed refresh is not hammered. Wrappers in `src/api/` and hooks in `src/hooks/` (`usePlanningTree`, `usePriorityOrder`, `useTimeline`, …) are the only way screens talk to the backend.

The Phase 6 ping (`ConnectionStatus` in `App.jsx`) proves the stack end-to-end: unauthenticated `/health/`, register + TOTP enrol + login, authenticated `/auth/me/`, and a **Force 401** that corrupts the access token and fires two parallel `/me` calls through a single refresh.

---

## Phase 7 — Verification gate

`planning/tests/test_tenant_isolation.py` does not maintain a URL list. It iterates `planning.urls.router.registry` and `canvas_integration.urls.router.registry`, keeps every `UserScopedMixin` viewset, and as user B issues GET/PATCH/PUT/DELETE (and detail actions `move`, `complete`) against user A's primary keys. Allowed outcomes are **403 or 404**. Alice's snapshot (titles, tags, marks, positions) must be unchanged.

Write-path cases cover the hole queryset scoping cannot close: create with Alice's `parent`, `tag_ids`, move under Alice, reorder Alice's priority `item_id`, reorder Alice's marks. A guard test fails if a new owned viewset is registered without a detail attempt.

The full suite at Phase 7 close: **259 tests**. `python manage.py check` is clean. `check --deploy` warnings (console mailer, no HSTS/SSL-only cookies) are accepted for local HTTP only; `DEBUG=False` still boots.

[`FR_TRACEABILITY.md`](FR_TRACEABILITY.md) maps FR-01–FR-16 onto endpoints, services and tests so the MVP can be graded requirement by requirement.

---

## Isolation, restated

A request from Bob never returns Alice's row, never mutates it, and never confirms it exists:

1. The row has `user_id` (`OwnedModel`).
2. The view queryset is `filter(user=request.user)` (`UserScopedMixin`) → 404.
3. Related PKs in the body are filtered the same way → 400 "does not exist".
4. Hierarchy SQL includes `user_id` in every CTE arm.
5. The router matrix in Phase 7 fails CI if a new owned detail route skips this.

That is the architecture: tenant identity is a column, a queryset, a serializer field, a SQL predicate, and a generated test — not a comment.
