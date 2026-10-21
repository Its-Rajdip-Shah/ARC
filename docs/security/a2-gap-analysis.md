# A2 security gap analysis

Maps A2 / FR security requirements onto the live ARC codebase after the
`feature/a2-security-hardening` work. Use this for demo and marking.

**Source of truth for "required":** A2 design/security intent as reflected in
`FR_TRACEABILITY.md` (FR-01–FR-03, FR-15–FR-16), `ARCHITECTURE.md` Phase 3,
and `AGENTS.md` (strict per-user isolation).

| Status | Meaning |
| --- | --- |
| Covered | Meets or exceeds the A2 bar; tests or clear code evidence |
| Partial | Core behaviour present; residual risk noted |
| Implemented (this PR) | Was a gap; closed in this branch |
| Waived | Explicitly accepted with rationale |

---

## Requirement matrix

| A2 / FR requirement | Status | Evidence |
| --- | --- | --- |
| **FR-01** Register + TOTP enrol; secret not stored until confirm | Covered | `accounts/views.py`, `accounts/tokens.py`, `accounts/tests/test_auth.py` |
| **FR-02** Two-step login; `mfa_pending` not usable as a session | Covered | `accounts/authentication.py` (`scope=full` only), auth tests |
| **FR-02** Refresh rotate + blacklist; logout revokes refresh and the presented access token | Covered | Logout blacklists the refresh token and, when the browser sends its access token, revokes that access token immediately. Logout still works with only the refresh token. |
| **FR-03** Users only see/mutate their own data | Covered | `UserScopedMixin`, `UserScopedPrimaryKeyRelatedField`, CTE `user_id`, `planning/tests/test_tenant_isolation.py` |
| **FR-03** Object-level ownership backstop (`IsOwner`) | Implemented (this PR) | `IsOwner` on every `UserScopedMixin` viewset; nested `planning_item__user` supported |
| **FR-15** Separate admin login + MFA; student tokens cannot use admin APIs | Covered | `AdminLoginView` / `AdminMFAVerifyView`, `IsAdminAccount`, `AdminRoute.jsx` |
| **FR-15** No password-only Django `/admin/` bypass of MFA | Implemented (this PR) | `ENABLE_DJANGO_ADMIN` defaults **False**; URL not mounted unless opted in |
| **FR-16** Lock ends live JWT; stats without planner contents | Covered | `ArcJWTAuthentication` re-reads `is_locked`; analytics tests |
| JWT access in memory; refresh persisted only | Covered | `frontend/src/stores/authStore.js` |
| Student / admin route guards | Covered | `StudentRoute.jsx`, `AdminRoute.jsx` |
| Anti-enumeration on login (credentials before lock/admin) | Covered | `LoginView` |
| TOTP replay protection | Covered | Cache-backed in `accounts/totp.py`. The cache table is shared by every worker. |
| Password validators | Covered | Django defaults in `settings.py` + register serializer |
| Secrets not in repo | Covered | `.env` gitignored; `.env.example` placeholders only |
| Auth brute-force / TOTP spraying limits | Implemented (this PR) | DRF `ScopedRateThrottle`: `auth` 30/min, `auth_strict` 10/min on login/MFA |
| Production HTTPS / HSTS / secure cookies | Implemented (this PR) | Env-gated flags in `settings.py` + `.env.example`; local defaults remain HTTP-safe |
| Security response headers (CSP on API, nosniff, …) | Implemented (this PR) | `core.middleware.SecurityHeadersMiddleware` |
| OpenAPI / browsable API locked down in production | Implemented (this PR) | Browsable API only when `DEBUG`; docs follow `DEBUG` / `ENABLE_API_DOCS` |
| Parameterised SQL / no injection on CTE paths | Covered | `planning/queries.py` |
| Canvas tokens encrypted; never returned in full | Covered | `EncryptedCharField`, write-only `api_token` |

---

## What changed in this branch

1. **Student logout** blacklists the refresh token (parity with admin).
2. **Logout** no longer requires a live access token (refresh is the credential).
3. **Auth throttling** on register / login / MFA / logout.
4. **`IsOwner`** attached via `UserScopedMixin`; nested ownership paths work.
5. **Django `/admin/`** off by default (`ENABLE_DJANGO_ADMIN=False`).
6. **Production TLS flags** wired and documented (opt-in via `.env`).
7. **Security headers** + JSON-only renderers outside `DEBUG`.
8. **API docs** gated; off when `DEBUG=False` unless `ENABLE_API_DOCS=True`.
9. **Tests** for headers, throttles, ownership, logout-without-access, admin/docs off.
10. **This gap analysis** for demo/marking.

---

## Residual risks / follow-ups

| Item | Severity | Notes |
| --- | --- | --- |
| A logout that does not send the access token leaves that token alive until expiry | Low | The browser sends it. A client that only has the refresh token can still revoke the refresh. |
| Register with the correct password on a finished account says to sign in | Low | The caller has already proved the password. A wrong password gets the same 201 shape as a new address and cannot attach a secret. |
| Full penetration test / third-party audit | Out of scope | Per issue; not claimed. |
| Frontend unit suite for route guards | Low | Guards exist; coverage is manual / E2E ping, not a dedicated Jest suite. |
| Production `.env` must flip TLS flags | Ops | `DEBUG=False`, `SECURE_SSL_REDIRECT=True`, HSTS > 0, secure cookies, real `SECRET_KEY`. |

---

## Later product changes

Password change and admin-approved reset shipped after this matrix. The behavior is in `ARCHITECTURE.md`: the admin queue id is not the student token, unknown emails get the same response as known ones, and the reset token stays in the browser that requested it. Study-plan UI and `/api/planning/study-plans/` are removed. `SchedulingState.study_plan` stays in the database and is unused.

## Local vs production deploy check

| Check | Local (`DEBUG=True`, HTTP) | Production |
| --- | --- | --- |
| `manage.py check` | Clean | Clean |
| `manage.py check --deploy` | Expected warnings (see `FR_TRACEABILITY.md`) | Should be clean once TLS env flags are set |
| Django `/admin/` | Off unless `ENABLE_DJANGO_ADMIN=True` | Keep off; use React staff console |
| `/api/docs/` | On (follows DEBUG) | Off unless staging explicitly enables it |
