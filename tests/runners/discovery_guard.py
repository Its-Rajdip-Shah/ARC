#!/usr/bin/env python3
"""Fail if frontend test files are missing from their assigned runners."""

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "frontend"
PACKAGE = json.loads((FRONTEND / "package.json").read_text())
VITEST_CONFIG = (FRONTEND / "vitest.config.js").read_text()


def fail(message):
    print(f"DISCOVERY_FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def discover():
    files = sorted(
        path.relative_to(FRONTEND).as_posix()
        for path in (FRONTEND / "src").rglob("*")
        if path.is_file()
        and re.search(r"\.(test|spec)\.[cm]?[jt]sx?$", path.name)
    )

    if not files:
        fail("No frontend tests discovered")

    node = []
    vitest = []

    for name in files:
        source = (FRONTEND / name).read_text()

        uses_node = bool(
            re.search(
                r"""(?:from\s*['"]node:test['"]|require\(['"]node:test['"]\))""",
                source,
            )
        )

        uses_vitest = bool(
            re.search(
                r"""(?:from\s*['"]vitest['"]|require\(['"]vitest['"]\))""",
                source,
            )
        )

        if uses_node == uses_vitest:
            fail(
                f"{name}: expected exactly one explicit "
                "node:test or vitest import"
            )

        (node if uses_node else vitest).append(name)

    return node, vitest


def configured_node_tests():
    script = PACKAGE["scripts"].get("test:node", "")

    if not script.startswith("node --test "):
        fail("Unexpected Node test command")

    return re.findall(
        r'"(src/[^"]+\.(?:test|spec)\.[cm]?[jt]sx?)"',
        script,
    )


def configured_vitest_tests():
    match = re.search(
        r"include:\s*\[([^\]]*)\]",
        VITEST_CONFIG,
        re.DOTALL,
    )

    if not match:
        fail("Vitest include allowlist not found")

    return re.findall(
        r"""['"](src/[^'"]+\.(?:test|spec)\.[cm]?[jt]sx?)['"]""",
        match.group(1),
    )


def verify(label, discovered, configured):
    if len(configured) != len(set(configured)):
        fail(f"{label}: duplicate configured test paths")

    missing = sorted(set(discovered) - set(configured))
    stale = sorted(set(configured) - set(discovered))

    if missing or stale:
        print(f"{label}_MISSING={missing}")
        print(f"{label}_STALE={stale}")
        fail(f"{label}: test inventory mismatch")

    print(f"{label}_FILES={len(discovered)}")


def main():
    node, vitest = discover()

    verify("NODE", node, configured_node_tests())
    verify("VITEST", vitest, configured_vitest_tests())

    print(f"FRONTEND_TEST_FILES={len(node) + len(vitest)}")
    print("DISCOVERY_GUARD=PASS")


if __name__ == "__main__":
    main()
