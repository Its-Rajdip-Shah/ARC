# ARC Frontend

React/Vite frontend for ARC.

For full project setup and architecture documentation, start with the
repository root `README.md` and the files under `docs/`.

## Requirements

- Node.js 20+
- npm
- ARC backend running locally

## Install

From `frontend/`:

    npm ci
    cp .env.example .env.local

On Windows PowerShell:

    npm ci
    Copy-Item .env.example .env.local

Default local API configuration:

    VITE_API_BASE_URL=http://127.0.0.1:8000/api

## Development

    npm run dev

Vite serves ARC at:

    http://localhost:5173

## Verification

    npm run lint
    npm run build

Timeline tests:

    node --test src/features/timeline/timelineActions.test.js
    node --test src/features/timeline/timelineRendering.test.js

## Optional real-browser Timeline test

The real-browser layout test is disabled by default.

Set:

    TIMELINE_BROWSER_TESTS=1
    CHROME_BIN=<path-to-a-Chromium-compatible-browser>

The source code must not assume a machine-specific browser path.

## Timeline / scheduler documentation

- `../docs/timelineview.md`
- `../docs/timeline_contract.md`
- `../docs/scheduler.md`
- `../docs/scheduler_contract.md`
