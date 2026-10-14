# ARC Regression Coverage Matrix

| Suite | Smoke | Regression | Integration | Certify | Browser |
|---|---|---|---|---|---|
| Node-native frontend | Yes | Yes | No | Yes | No |
| Vitest frontend | Yes | Yes | No | Yes | No |
| Frozen backend contracts | No | Yes | Included | Yes | No |
| Complete backend pytest | No | No | Yes | Yes | No |
| PostgreSQL preflight | No | No | No | Yes | No |
| Playwright | No | No | No | No | Yes |

## Certification boundaries

`make certify` requires PostgreSQL configuration and passing backend
tests. Playwright is optional and does not affect certification status.

The current Playwright harness uses SQLite. Browser results must not be
represented as PostgreSQL-backed browser certification.

The PostgreSQL preflight verifies Django configuration and expected
pytest test-database naming. Runtime isolation remains subject to
independent freeze inspection.

## Invariants

- No silently omitted frontend tests.
- Nonzero exit codes on required failures.
- Missing and malformed JUnit reports fail the gate.
- Skips remain visible.
- Existing test assertions are preserved.
- Frozen scheduler and canonical-state ownership are unchanged.
