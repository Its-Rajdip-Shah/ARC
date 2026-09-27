import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let server, planning, apiClient, Toolbar, useActions
before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: 'custom',
    plugins: [(await import('@vitejs/plugin-react')).default()],
  })
  planning = await server.ssrLoadModule('/src/api/planning.js')
  ;({ apiClient } = await server.ssrLoadModule('/src/lib/apiClient.js'))
  Toolbar = (await server.ssrLoadModule('/src/features/timeline/TimelineToolbar.jsx')).default
  useActions = (await server.ssrLoadModule('/src/features/timeline/useTimelineActions.js')).default
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

test('toolbar exposes an accessible Reschedule action disabled while pending', () => {
  for (const busy of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(Toolbar, {
      find: { query: '' }, actions: { busy, history: { data: {} } },
      anchor: '2026-09-14', zoom: 'day', options: { type: 'all' },
    }))
    const button = html.match(/<button[^>]*aria-label="Reschedule"[^>]*>/)[0]
    assert.match(button, /title="Reschedule"/)
    assert.equal(button.includes('disabled=""'), busy)
  }
})

test('successful Reschedule invalidates planning queries without changing view state', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidations = []
  client.invalidateQueries = async (filters) => { invalidations.push(filters) }
  let actions
  function Harness() { actions = useActions(); return null }
  renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, React.createElement(Harness)))
  const calls = []
  apiClient.defaults.adapter = async (config) => {
    calls.push([config.method, config.url])
    return { data: { changed_ids: [1], conflicts: [] }, status: 200, config }
  }
  try {
    await actions.run('reschedule')
    assert.deepEqual(calls, [['post', 'planning/timeline/reschedule/']])
    assert.deepEqual(invalidations, [{ queryKey: ['planning'] }])
  } finally { client.clear() }
})
