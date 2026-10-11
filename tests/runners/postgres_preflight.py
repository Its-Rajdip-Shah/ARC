#!/usr/bin/env python3
"""Fail certification unless Django is configured for isolated PostgreSQL tests."""

import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "arc_backend.settings")

import django

django.setup()

from django.conf import settings
from django.db import connection

database = settings.DATABASES["default"]

if connection.vendor != "postgresql":
    raise SystemExit(
        "POSTGRES_PREFLIGHT=FAIL: Django is not configured for PostgreSQL"
    )

development_name = database.get("NAME")
test_settings = database.get("TEST") or {}
test_name = test_settings.get("NAME") or f"test_{development_name}"

if not development_name:
    raise SystemExit("POSTGRES_PREFLIGHT=FAIL: Missing database name")

if not test_name or test_name == development_name:
    raise SystemExit(
        "POSTGRES_PREFLIGHT=FAIL: Test database is not isolated"
    )

if not str(test_name).startswith("test_"):
    raise SystemExit(
        "POSTGRES_PREFLIGHT=FAIL: Unexpected test database name"
    )

print("POSTGRES_PREFLIGHT=PASS")
print("DATABASE_VENDOR=postgresql")
print(f"DEVELOPMENT_DATABASE={development_name}")
print(f"PYTEST_DATABASE={test_name}")
print("DEVELOPMENT_DATABASE_MUTATION=NOT_REQUESTED")
