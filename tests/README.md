# ARC Testing Infrastructure

ARC uses centralized test orchestration while retaining colocated tests. The suite matrix is [`contracts/regression_matrix.md`](contracts/regression_matrix.md). The repository documentation map is [`../docs/README.md`](../docs/README.md).

## Commands

Each level adds a kind of proof. A higher level does not replace reading the one under it.

| Command | What it verifies |
| --- | --- |
| `make smoke` | Node-native and Vitest frontend tests |
| `make regression` | Frontend tests and frozen backend contracts |
| `make integration` | Complete backend pytest suite |
| `make certify` | All frontend tests, frozen contracts, the complete backend suite, and the PostgreSQL preflight |
| `make browser` | Optional Playwright end-to-end tests |

`make smoke`, `make regression`, `make integration`, and `make certify` run the frontend discovery guard before any suite. A broken inventory stops the gate. `make certify` records browser verification as not run. Playwright stays on `make browser`, and that harness uses SQLite, so it is not PostgreSQL certification.

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
