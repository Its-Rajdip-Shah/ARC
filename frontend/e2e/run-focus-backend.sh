#!/bin/bash
set -euo pipefail

ROOT="$(
  cd "$(dirname "$0")/../.." &&
  pwd
)"

DB="/tmp/arc_focus_browser_e2e.sqlite3"

rm -f "$DB"

export DATABASE_URL="sqlite:////tmp/arc_focus_browser_e2e.sqlite3"
export ALLOWED_HOSTS="127.0.0.1,localhost"
export CORS_ALLOWED_ORIGINS="http://127.0.0.1:4173"

cd "$ROOT/backend"

.venv/bin/python manage.py migrate \
  --noinput \
  >/tmp/arc_focus_e2e_migrate.log

exec .venv/bin/python manage.py runserver \
  127.0.0.1:8001 \
  --noreload
