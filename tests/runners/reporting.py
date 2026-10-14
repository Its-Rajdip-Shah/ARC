#!/usr/bin/env python3
"""Run ARC regression gates and preserve auditable test reports."""

import json
import os
import shlex
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "frontend"
BACKEND = ROOT / "backend"
REPORT_ROOT = ROOT / "tests" / "reports"

LEVELS = {"smoke", "regression", "integration", "certify"}


def git(*args):
    return subprocess.check_output(
        ["git", *args],
        cwd=ROOT,
        text=True,
    ).strip()


def read_junit(path):
    tree = ET.parse(path)
    root = tree.getroot()

    suites = []

    if root.tag == "testsuite":
        suites = [root]
    elif root.tag == "testsuites":
        suites = list(root.iter("testsuite"))
        if not suites and not list(root.iter("testcase")):
            raise ValueError("JUnit contains no test cases")
    else:
        raise ValueError(f"Unexpected JUnit root: {root.tag}")

    cases = list(root.iter("testcase"))

    if not cases:
        raise ValueError("JUnit contains no test cases")

    failures = 0
    errors = 0
    skipped = 0

    for case in cases:
        if case.find("failure") is not None:
            failures += 1
        elif case.find("error") is not None:
            errors += 1
        elif case.find("skipped") is not None:
            skipped += 1

    return {
        "tests": len(cases),
        "passed": len(cases) - failures - errors - skipped,
        "failed": failures,
        "errors": errors,
        "skipped": skipped,
    }


def execute(name, command, cwd, directory, junit=False):
    started = time.monotonic()
    log_path = directory / f"{name}.log"
    xml_path = directory / f"{name}.xml"

    print(f"\n=== RUNNING: {name} ===", flush=True)

    result = {
        "name": name,
        "command": command,
        "cwd": str(cwd.relative_to(ROOT)),
        "log": log_path.name,
        "junit": xml_path.name if junit else None,
        "exit_code": None,
        "duration_seconds": None,
        "status": "FAIL",
        "counts": None,
        "report_error": None,
    }

    try:
        with log_path.open("w") as log:
            process = subprocess.run(
                command,
                cwd=cwd,
                stdout=log,
                stderr=subprocess.STDOUT,
                check=False,
            )

        result["exit_code"] = process.returncode

    except OSError as error:
        log_path.write_text(f"EXECUTION ERROR: {error}\n")
        result["report_error"] = str(error)

    result["duration_seconds"] = round(
        time.monotonic() - started,
        3,
    )

    if junit:
        if not xml_path.is_file():
            result["report_error"] = (
                result["report_error"] or "JUnit report missing"
            )
        else:
            try:
                result["counts"] = read_junit(xml_path)
            except (ET.ParseError, ValueError, OSError) as error:
                result["report_error"] = f"Invalid JUnit: {error}"

    if result["exit_code"] == 0 and result["report_error"] is None:
        if not junit or (
            result["counts"] is not None
            and result["counts"]["failed"] == 0
            and result["counts"]["errors"] == 0
        ):
            result["status"] = "PASS"

    print(
        f"{result['status']}: {name} "
        f"({result['duration_seconds']}s, "
        f"exit={result['exit_code']})",
        flush=True,
    )

    if result["counts"]:
        print(f"COUNTS: {result['counts']}", flush=True)

    if result["report_error"]:
        print(f"REPORT_ERROR: {result['report_error']}", flush=True)

    if result["status"] != "PASS":
        print(f"Inspect: {log_path}", flush=True)

    return result


def node_command(xml_path):
    package = json.loads(
        (FRONTEND / "package.json").read_text()
    )

    script = package["scripts"]["test:node"]
    command = shlex.split(script)

    if command[:2] != ["node", "--test"]:
        raise ValueError("Unexpected Node test command")

    return [
        "node",
        "--test",
        "--test-concurrency=1",
        "--test-reporter=junit",
        f"--test-reporter-destination={xml_path}",
        *command[2:],
    ]


def vitest_command(xml_path):
    return [
        "npm",
        "run",
        "test:unit",
        "--",
        "--reporter=junit",
        f"--outputFile={xml_path}",
    ]


def pytest_command(target, xml_path):
    return [
        str(BACKEND / ".venv" / "bin" / "python"),
        "-m",
        "pytest",
        *target,
        "-q",
        f"--junitxml={xml_path}",
    ]


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in LEVELS:
        print(
            "Usage: reporting.py "
            "{smoke|regression|integration|certify}",
            file=sys.stderr,
        )
        return 2

    level = sys.argv[1]
    timestamp = datetime.now(timezone.utc).strftime(
        "%Y%m%dT%H%M%SZ"
    )
    directory = REPORT_ROOT / f"{timestamp}_{level}"

    if directory.exists():
        print(
            f"Report directory already exists: {directory}",
            file=sys.stderr,
        )
        return 2

    directory.mkdir(parents=True)

    started = time.monotonic()

    summary = {
        "schema_version": 1,
        "level": level,
        "timestamp_utc": timestamp,
        "commit": git("rev-parse", "HEAD"),
        "branch": git("branch", "--show-current"),
        "dirty_worktree": bool(git("status", "--porcelain")),
        "status": "FAIL",
        "duration_seconds": None,
        "totals": None,
        "suites": [],
        "certification_blocker": None,
    }

    print("ARC STRUCTURED REGRESSION")
    print(f"Level: {level}")
    print(f"Commit: {summary['commit']}")
    print(f"Reports: {directory}")

    try:
        discovery = execute(
            "discovery",
            [
                sys.executable,
                str(ROOT / "tests/runners/discovery_guard.py"),
            ],
            ROOT,
            directory,
        )
        summary["suites"].append(discovery)

        # A broken inventory invalidates the gate.
        # No test runner is launched with an unverified inventory.
        if discovery["status"] == "PASS":

            if level == "certify":
                postgres = execute(
                    "postgres_preflight",
                    [
                        str(BACKEND / ".venv" / "bin" / "python"),
                        str(ROOT / "tests/runners/postgres_preflight.py"),
                    ],
                    BACKEND,
                    directory,
                )
                summary["suites"].append(postgres)

            if level in {"smoke", "regression", "certify"}:
                node_xml = directory / "node.xml"
                summary["suites"].append(
                    execute(
                        "node",
                        node_command(node_xml),
                        FRONTEND,
                        directory,
                        junit=True,
                    )
                )

                vitest_xml = directory / "vitest.xml"
                summary["suites"].append(
                    execute(
                        "vitest",
                        vitest_command(vitest_xml),
                        FRONTEND,
                        directory,
                        junit=True,
                    )
                )

            if level in {"regression", "certify"}:
                contracts_xml = directory / "contracts.xml"
                summary["suites"].append(
                    execute(
                        "contracts",
                        pytest_command(
                            ["planning/tests/contract"],
                            contracts_xml,
                        ),
                        BACKEND,
                        directory,
                        junit=True,
                    )
                )

            if level in {"integration", "certify"}:
                backend_xml = directory / "backend.xml"
                summary["suites"].append(
                    execute(
                        "backend",
                        pytest_command([], backend_xml),
                        BACKEND,
                        directory,
                        junit=True,
                    )
                )

        if level == "certify":
            summary["browser_verification"] = (
                "NOT_RUN_OPTIONAL"
            )

    except Exception as error:
        summary["orchestration_error"] = repr(error)

    finally:
        counts = {
            "tests": 0,
            "passed": 0,
            "failed": 0,
            "errors": 0,
            "skipped": 0,
        }

        for suite in summary["suites"]:
            if suite["counts"]:
                for key in counts:
                    counts[key] += suite["counts"][key]

        summary["totals"] = counts
        summary["duration_seconds"] = round(
            time.monotonic() - started,
            3,
        )

        successful = (
            bool(summary["suites"])
            and all(
                suite["status"] == "PASS"
                for suite in summary["suites"]
            )
            and "orchestration_error" not in summary
            and summary["certification_blocker"] is None
            and (
                level != "certify"
                or any(
                    suite["name"] == "postgres_preflight"
                    and suite["status"] == "PASS"
                    for suite in summary["suites"]
                )
            )
        )

        summary["status"] = "PASS" if successful else "FAIL"

        report_path = directory / "summary.json"
        report_path.write_text(
            json.dumps(summary, indent=2) + "\n"
        )

        print("\n=== FINAL SUMMARY ===")
        print(f"STATUS={summary['status']}")
        print(f"TOTALS={counts}")
        print(f"REPORT={report_path}")

        if summary["certification_blocker"]:
            print(summary["certification_blocker"])

        if "orchestration_error" in summary:
            print(summary["orchestration_error"])

    return 0 if summary["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
