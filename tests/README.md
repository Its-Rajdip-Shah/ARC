# ARC Testing Infrastructure

ARC uses centralized test orchestration while retaining colocated tests.

## Commands

- `make smoke`: Node-native and Vitest suites.
- `make regression`: Frontend suites and frozen backend contracts.
- `make integration`: Complete backend pytest suite.
- `make certify`: Frontend, frozen contracts, complete backend suite,
  and PostgreSQL configuration verification.
- `make browser`: Optional Playwright browser verification.

## Certification scope

`make certify` requires Django to be configured for PostgreSQL.

Pytest-Django uses a separate test database rather than the development
database. The certification preflight checks the configured database
engine and expected test-database identity.

The preflight does not itself prove the runtime database identity inside
each pytest test. That remains an independent freeze-inspection item.

Playwright is deliberately excluded from mandatory certification.
A passing certification does not establish browser end-to-end correctness.

The existing Playwright harness uses SQLite and is retained for targeted
browser verification.

## Initial regression baseline

- Backend frozen contracts: 211 passing.
- Node-native frontend: 120 passing, one skipped.
- Vitest: 13 passing.
- Total: 344 passing, one skipped.

These counts are historical baselines, not permanent expectations.

## Policy

- Required suite failures must produce nonzero exit codes.
- Missing or invalid JUnit reports must fail their gate.
- Skipped tests must remain visible.
- New frontend test files must pass the discovery guard.
- Never weaken frozen scheduler or canonical-state assertions to obtain
  a passing gate.
