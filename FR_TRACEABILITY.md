# ARC functional-requirement traceability

Maps FR-01 through FR-16 onto the API, the domain services behind it, and the tests that prove the rule. Endpoints are relative to the Django origin; the frontend Axios client prefixes them with `VITE_API_BASE_URL` (typically `http://127.0.0.1:8000/api`).

Isolation (FR-03) is not repeated on every row: every planning, Canvas and admin-user-data endpoint is user-scoped through `core.mixins.UserScopedMixin` and `core.serializers.UserScopedPrimaryKeyRelatedField`. The dedicated sweep is `planning/tests/test_tenant_isolation.py`.

## FR-01 — Account registration and TOTP enrolment

| Layer | Location |
| --- | --- |
| Endpoints | `POST /api/auth/register/`, `POST /api/auth/mfa/enroll/confirm/` |
| Implementation | `accounts/views.py` (`RegisterView`, `MFAEnrolConfirmView`); `accounts/totp.py`; `accounts/tokens.py` (`MFAEnrolmentToken`); `core.fields.EncryptedCharField` on `User.totp_secret_encrypted` |
| Tests | `accounts/tests/test_auth.py` |

The TOTP secret is held in the enrolment token until the first valid code is submitted, so an abandoned registration cannot log in.

## FR-02 — Two-step login

| Layer | Location |
| --- | --- |
| Endpoints | `POST /api/auth/login/`, `POST /api/auth/login/mfa/`, `POST /api/auth/token/refresh/`, `POST /api/auth/logout/`, `GET /api/auth/me/` |
| Implementation | `accounts/views.py` (`LoginView`, `MFAVerifyView`, `LogoutView`, `MeView`); `accounts/authentication.py` (`ArcJWTAuthentication` rejects `mfa_pending` tokens and re-reads `is_locked`); `accounts/tokens.py` (`MFAPendingToken`); frontend `src/stores/authStore.js`, `src/lib/apiClient.js` |
| Tests | `accounts/tests/test_auth.py`; frontend ping in `frontend/src/pages/ConnectionStatus.jsx` |

Password and TOTP are separate requests. The only link is a five-minute `mfa_pending` token that `ArcJWTAuthentication` refuses everywhere except the MFA verify view.

## FR-03 — User data isolation

| Layer | Location |
| --- | --- |
| Endpoints | Every `/api/planning/*` and `/api/canvas/*` route; write payloads that name `parent`, `tag_ids`, `parent_id`, `item_id`, `ordered_ids` |
| Implementation | `core/mixins.py` (`UserScopedMixin`); `core/serializers.py` (`UserScopedPrimaryKeyRelatedField`); `core/permissions.py` (`IsOwner`); `core/models.py` (`OwnedModel`); recursive CTEs in `planning/queries.py` are additionally scoped by `user_id` |
| Tests | `planning/tests/test_tenant_isolation.py` (router-driven GET/PATCH/PUT/DELETE plus write-path parent/tag/priority/marks); isolation cases in `planning/tests/test_api.py`, `canvas_integration/tests/test_api.py`, `planning/tests/test_hierarchy.py`, `planning/tests/test_priority.py`, `planning/tests/test_scheduling.py`, `planning/tests/test_overdue.py` |

Foreign primary keys surface as **404** on detail routes (the row falls out of the queryset) and as **400** on write payloads (the related field's queryset is empty). Either way the API does not confirm that another user's object exists.

## FR-04 — Canvas connection

| Layer | Location |
| --- | --- |
| Endpoints | `GET/PUT/DELETE /api/canvas/connection/`, `POST /api/canvas/connection/test/`, `GET /api/canvas/sync-logs/`, `GET /api/canvas/sync-logs/{id}/` |
| Implementation | `canvas_integration/views.py`; `canvas_integration/client.py` (`whoami`); `canvas_integration/models.py` (`CanvasConnection`, `SyncLog`); token stored in `EncryptedCharField` and never returned (write-only `api_token`, `token_hint` only) |
| Tests | `canvas_integration/tests/test_api.py` |

## FR-05 — Canvas synchronisation

| Layer | Location |
| --- | --- |
| Endpoints | `POST /api/canvas/sync/` |
| Implementation | `canvas_integration/sync.py` (`run_sync`); upserts on `(user, canvas_object_type, canvas_object_id)`; courses become root `GOAL` items, assignments become children; missing Canvas dates/weights are left null (adaptive under FR-11, unmarked under FR-14) |
| Tests | `canvas_integration/tests/test_api.py` |

Every attempt writes a `SyncLog` row, successful or not. A re-sync updates titles and due dates and leaves the user's completion flags, tags, priority and marks alone.

## FR-06 — Hierarchy and cycle detection

| Layer | Location |
| --- | --- |
| Endpoints | `GET /api/planning/items/tree/`, `POST /api/planning/items/{id}/move/`, `POST /api/planning/items/` (`parent`), item CRUD |
| Implementation | `planning/services/hierarchy.py` (`validate_parent`, `set_parent`, `reindex_siblings`); `planning/queries.py` (recursive CTEs, `MAX_DEPTH`); `PlanningItem` check constraint `planning_item_no_self_parent` |
| Tests | `planning/tests/test_hierarchy.py`; `planning/tests/test_api.py` (tree, move); `planning/tests/test_tenant_isolation.py` (foreign parent) |

## FR-07 — Tags

| Layer | Location |
| --- | --- |
| Endpoints | `/api/planning/tags/` CRUD; item write field `tag_ids` |
| Implementation | `planning/models.py` (`Tag`, `PlanningItemTag`); `planning/serializers.py` (`TagSerializer`, `PlanningItemSerializer._set_tags`); unique `(user, name)` |
| Tests | `planning/tests/test_api.py`; `planning/tests/test_tenant_isolation.py` (foreign `tag_ids`) |

## FR-08 — Search and cascade completion

| Layer | Location |
| --- | --- |
| Endpoints | `GET /api/planning/items/?search=`, `POST /api/planning/items/{id}/complete/` |
| Implementation | `PlanningItemQuerySet.search`; `planning/services/hierarchy.py` (`complete_subtree`, `reopen`); completing a parent completes descendants and releases their priority positions |
| Tests | `planning/tests/test_hierarchy.py`; `planning/tests/test_api.py` |

Re-opening is deliberately not a cascade.

## FR-09 — Global priority order

| Layer | Location |
| --- | --- |
| Endpoints | `GET /api/planning/priority/`, `POST /api/planning/priority/reorder/` |
| Implementation | `planning/services/priority.py` (`assign_initial_position`, `reorder`, `release_position`, `restore_position`); deferrable unique constraint `uniq_user_priority_position` |
| Tests | `planning/tests/test_priority.py`; `planning/tests/test_api.py`; `planning/tests/test_tenant_isolation.py` (foreign `item_id`) |

## FR-10 — Timeline

| Layer | Location |
| --- | --- |
| Endpoints | `GET /api/planning/timeline/?from=&to=` |
| Implementation | `planning/views.py` (`TimelineView`); `PlanningItemQuerySet.in_window`; grouped by root via `planning/queries.py` |
| Tests | `planning/tests/test_api.py` (`test_the_timeline_*`) |

## FR-11 — Adaptive rescheduling

| Layer | Location |
| --- | --- |
| Endpoints | `GET /api/planning/timeline/` (first read of the day runs the sweep). `scheduled_date` is read-only on `PlanningItemSerializer`; clients cannot forge an adaptive date. |
| Implementation | `planning/services/scheduling.py` (`roll_forward_adaptive`); `planning/views.py` (`ensure_scheduled`). The sweep never mutates `due_date`. |
| Tests | `planning/tests/test_scheduling.py`; `planning/tests/test_api.py` (`test_reading_the_timeline_rolls_neglected_adaptive_tasks_forward`) |

## FR-12 — Overdue Recent and Backlog

| Layer | Location |
| --- | --- |
| Endpoints | `GET /api/planning/overdue/` |
| Implementation | `planning/services/overdue.py` (`classify`); `RECENT_OVERDUE_DAYS = 7`; only incomplete fixed-date actionable items |
| Tests | `planning/tests/test_overdue.py`; `planning/tests/test_api.py` |

Adaptive items cannot appear here: they have no `due_date`.

## FR-13 — Contextual timezones

| Layer | Location |
| --- | --- |
| Endpoints | `/api/planning/timezones/` CRUD; included on `GET /api/planning/timeline/` |
| Implementation | `planning/models.py` (`Timezone`); overlapping ranges allowed; `end_date >= start_date` |
| Tests | `planning/tests/test_api.py` |

Unrelated to `django.utils.timezone`: these are named date ranges (semester, exam period, break).

## FR-14 — Marks

| Layer | Location |
| --- | --- |
| Endpoints | `GET /api/planning/marks/`, `POST /api/planning/marks/reorder/`, `/api/planning/assignment-details/{id}/` |
| Implementation | `planning/views.py` (`MarksView`, `MarksReorderView`, `AssignmentDetailViewSet`); `mark_achieved` nullable — unmarked is not zero and is excluded from totals |
| Tests | `planning/tests/test_api.py`; `planning/tests/test_tenant_isolation.py` (foreign `ordered_ids`) |

## FR-15 — Separate administrator entry

| Layer | Location |
| --- | --- |
| Endpoints | `POST /api/auth/admin/login/`, `POST /api/auth/admin/login/mfa/` |
| Implementation | `accounts/views.py` (`AdminLoginView`, `AdminMFAVerifyView`) reject `is_admin=False`; `core.permissions.IsAdminAccount` gates `/api/admin/*`. Frontend: `frontend/src/pages/admin/AdminLoginPage.jsx` (staff-only two-step form), `frontend/src/components/AdminRoute.jsx` (`is_admin` gate), `frontend/src/stores/authStore.js` |
| Tests | `accounts/tests/test_auth.py`; `analytics/tests/test_api.py` |

An ordinary account's token is 403 on every admin route. A pending admin token cannot be redeemed on the student MFA endpoint, and vice versa. The React staff console is a separate route (`/admin/login`); it does not use or link to Django's built-in admin.

## FR-16 — Admin stats, lock and unlock

| Layer | Location |
| --- | --- |
| Endpoints | `GET /api/admin/stats/`, `GET /api/admin/users/`, `GET /api/admin/users/{id}/`, `POST /api/admin/users/{id}/lock/`, `POST /api/admin/users/{id}/unlock/` |
| Implementation | `analytics/views.py` (`PlatformStatsView`, `AdminUserViewSet`); `accounts.UserQuerySet` (`admins`, `locked`, `active_since`, `mfa_enrolled`); locking re-reads `is_locked` in `ArcJWTAuthentication`, so a live session dies on the next request. Frontend: `frontend/src/pages/admin/AdminDashboardPage.jsx` (platform health and attention list), `frontend/src/pages/admin/AdminUsersPage.jsx` (email search, lock/restore), `frontend/src/hooks/useAdmin.js` |
| Tests | `analytics/tests/test_api.py` |

The admin console reports counts and account state, never the contents of anyone's planner. An administrator cannot lock their own account. Operators review locked accounts and missing MFA from the Overview "needs attention" panel, then act on the Accounts table.

---

## Isolation matrix (FR-03 sweep)

`planning/tests/test_tenant_isolation.py` walks `planning.urls.router` and `canvas_integration.urls.router` for every `UserScopedMixin` viewset and, as user B, issues GET/PATCH/PUT/DELETE (and detail actions `move`, `complete`) against user A's primary keys. Write-path extras cover foreign `parent`, `tag_ids`, `parent_id`, priority `item_id` and marks `ordered_ids`.

## Local deployment check

`python manage.py check` is clean.

`python manage.py check --deploy` is **knowingly not clean** on a local HTTP setup. With `DEBUG=False` the app still boots (`django.setup()` and WSGI import succeed; `manage.py check` reports 0 issues). The remaining `--deploy` findings are accepted for development only:

| Id | Issue | Why we accept it locally |
| --- | --- | --- |
| `mail.E001` | `console.EmailBackend` in `MAILERS` | ARC does not send mail in this MVP; the console backend is the documented Django default for development. |
| `security.W004` | `SECURE_HSTS_SECONDS` unset | HSTS on `http://127.0.0.1` would lock browsers out of the local origin. |
| `security.W008` | `SECURE_SSL_REDIRECT` is not `True` | Local Vite (`http://localhost:5173`) and `runserver` speak HTTP. |
| `security.W012` | `SESSION_COOKIE_SECURE` is not `True` | Session cookies are unused; auth is bearer JWT. Still unsafe to force `Secure` on HTTP. |
| `security.W016` | `CSRF_COOKIE_SECURE` is not `True` | Same: HTTPS-only CSRF cookies break HTTP local. |
| `security.W018` | `DEBUG=True` | Reported when `.env` has `DEBUG=True`. Expected for local; setting `DEBUG=False` clears this warning and the process still starts. |

Production must set `DEBUG=False`, a real `SECRET_KEY`, HTTPS, HSTS, secure cookies, and a non-console mailer. Those are out of scope for the local MVP.
