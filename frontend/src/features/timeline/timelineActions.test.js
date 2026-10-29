import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let server, planning, apiClient, SchedulerRunButton, timelineActions, schedulerSettings
before(async () => {
  server = await createServer({
    configFile: false,
    // Node's test runner starts test files concurrently.  This embedded Vite
    // server must not contend with the Timeline rendering test's dep cache.
    cacheDir: 'node_modules/.vite-node-timeline-actions',
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: 'custom',
    plugins: [(await import('@vitejs/plugin-react')).default()],
  })
  planning = await server.ssrLoadModule('/src/api/planning.js')
  ;({ apiClient } = await server.ssrLoadModule('/src/lib/apiClient.js'))
  SchedulerRunButton = (await server.ssrLoadModule('/src/features/timeline/SchedulerRunButton.jsx')).default
  timelineActions = await server.ssrLoadModule('/src/features/timeline/useTimelineActions.js')
  schedulerSettings = await server.ssrLoadModule('/src/hooks/useSchedulerSettings.js')
})
after(async () => { await server?.close() })

test('Reschedule API posts the global endpoint and returns its result', async () => {
  const calls = []
  apiClient.defaults.adapter = async (config) => {
    calls.push([config.method, config.url])
    return { data: { changed_ids: [1], conflicts: [] }, status: 200, config }
  }
  assert.deepEqual(await planning.rescheduleTimeline(), { changed_ids: [1], conflicts: [] })
  assert.deepEqual(calls, [['post', 'planning/timeline/reschedule/']])
})

test('header scheduler control exposes accessible Reschedule state and disables while busy', () => {
  for (const busy of [false, true]) {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
        mutations: {
          retry: false,
        },
      },
    })

    const html = renderToStaticMarkup(
      React.createElement(
        QueryClientProvider,
        {
          client,
        },
        React.createElement(
          SchedulerRunButton,
          {
            runtime: {
              configured: true,
              flavour: 'lock-in',
            },
            actions: {
              busy,
              rescheduling: busy,
              run: async () => {},
            },
          },
        ),
      ),
    )

    const button = html.match(
      /<button[^>]*aria-label="Reschedule Timeline using Locked-In"[^>]*>/
    )[0]

    assert.match(
      button,
      /title="Reschedule · Locked-In"/,
    )

    assert.equal(
      button.includes('disabled=""'),
      busy,
    )
  }
})

test('planning invalidation helper invalidates the planning query family', async () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })

  const invalidations = []

  client.invalidateQueries =
    async (filters) => {
      invalidations.push(
        filters,
      )
    }

  try {
    await timelineActions
      .invalidatePlanningQueries(
        client,
      )

    assert.deepEqual(
      invalidations,
      [
        {
          queryKey: [
            'planning',
          ],
        },
      ],
    )

  } finally {
    client.clear()
  }
})

test('scheduler flavour is persisted before its automatic reschedule', async () => {
  const calls = []

  apiClient.defaults.adapter =
    async (config) => {
      calls.push({
        method:
          config.method,

        url:
          config.url,

        data:
          config.data,
      })

      if (
        config.url ===
        'planning/scheduler/settings/'
      ) {
        return {
          data: {
            flavour:
              'monk',
          },
          status:
            200,
          config,
        }
      }

      return {
        data: {
          changed_ids: [],
          conflicts: [],
        },
        status:
          200,
        config,
      }
    }

  const saved =
    await schedulerSettings
      .saveSchedulerFlavour(
        'monk',
      )

  assert.deepEqual(
    saved,
    {
      flavour:
        'monk',
    },
  )

  assert.deepEqual(
    calls.map(
      ({
        method,
        url,
      }) => [
        method,
        url,
      ],
    ),
    [
      [
        'put',
        'planning/scheduler/settings/',
      ],
      [
        'post',
        'planning/timeline/reschedule/',
      ],
    ],
  )

  const payload =
    typeof calls[0].data ===
      'string'
      ? JSON.parse(
          calls[0].data,
        )
      : calls[0].data

  assert.deepEqual(
    payload,
    {
      flavour:
        'monk',
    },
  )
})

test('clearing scheduler flavour persists without automatic reschedule', async () => {
  const calls = []

  apiClient.defaults.adapter =
    async (config) => {
      calls.push([
        config.method,
        config.url,
      ])

      return {
        data: {
          flavour:
            null,
        },
        status:
          200,
        config,
      }
    }

  await schedulerSettings
    .saveSchedulerFlavour(
      null,
    )

  assert.deepEqual(
    calls,
    [
      [
        'put',
        'planning/scheduler/settings/',
      ],
    ],
  )
})
