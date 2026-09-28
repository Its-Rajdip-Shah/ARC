import { useState } from 'react'

import {
  useCanvasConnection,
  useDeleteCanvasConnection,
  useSaveCanvasConnection,
  useSyncCanvas,
  useTestCanvasConnection,
} from '../../hooks/useCanvas'
import { useSchedulerSettings } from '../../hooks/useSchedulerSettings'
import { errorMessage, formatInstant } from '../../lib/errors'

const FLAVOURS = [
  {
    value: 'lock-in',
    title: 'Locked-In',
    description: 'Push harder toward deadlines and use available time more aggressively.',
  },
  {
    value: 'monk',
    title: 'Monk',
    description: 'Prefer a calmer schedule with lower daily intensity where deadlines allow it.',
  },
]

const TABS = [
  { id: 'integration', label: 'Integration' },
  { id: 'account', label: 'Account' },
]

function canvasMessage(error, fallback = 'Request failed') {
  const data = error?.response?.data
  return (
    data?.detail ||
    data?.error_message ||
    data?.error?.message ||
    errorMessage(error) ||
    fallback
  )
}

function IntegrationPanel() {
  const connection = useCanvasConnection()
  const saveConnection = useSaveCanvasConnection()
  const testConnection = useTestCanvasConnection()
  const sync = useSyncCanvas()
  const disconnect = useDeleteCanvasConnection()

  const [token, setToken] = useState('')
  const [banner, setBanner] = useState(null)

  const connected = Boolean(connection.data)
  const lastLog = connection.data?.last_sync
  const lastError =
    lastLog?.status === 'FAILED' ? lastLog.error_message : null

  async function onSave(event) {
    event.preventDefault()
    setBanner(null)
    try {
      await saveConnection.mutateAsync({ api_token: token.trim() })
      setToken('')
      setBanner({ tone: 'ok', text: 'Canvas token saved and verified.' })
    } catch (error) {
      setBanner({
        tone: 'error',
        text: canvasMessage(error, 'Canvas rejected that token.'),
      })
    }
  }

  async function onTest() {
    setBanner(null)
    try {
      const result = await testConnection.mutateAsync()
      setBanner({
        tone: 'ok',
        text: result.name
          ? `Token works (${result.name}).`
          : 'Token works.',
      })
    } catch (error) {
      setBanner({
        tone: 'error',
        text: canvasMessage(error, 'Could not verify the token.'),
      })
    }
  }

  async function onSync() {
    setBanner(null)
    try {
      const log = await sync.mutateAsync()
      const created =
        (log.counts?.courses_created || 0) + (log.counts?.assignments_created || 0)
      const updated =
        (log.counts?.courses_updated || 0) + (log.counts?.assignments_updated || 0)
      setBanner({
        tone: 'ok',
        text: `Sync finished. ${created} new, ${updated} updated.`,
      })
    } catch (error) {
      setBanner({
        tone: 'error',
        text: canvasMessage(error, 'Sync failed. Previous data was kept.'),
      })
    }
  }

  async function onDisconnect() {
    setBanner(null)
    try {
      await disconnect.mutateAsync()
      setBanner({ tone: 'ok', text: 'Canvas disconnected. Imported items were kept.' })
    } catch (error) {
      setBanner({
        tone: 'error',
        text: canvasMessage(error, 'Could not disconnect.'),
      })
    }
  }

  const busy =
    saveConnection.isPending ||
    testConnection.isPending ||
    sync.isPending ||
    disconnect.isPending

  return (
    <section className="space-y-4 rounded-[15px] border border-[#4a496b] bg-arc-panel p-5">
      <h2 className="text-lg font-semibold">Canvas</h2>
      <p className="text-sm text-arc-text-secondary">
        Paste a personal access token. ARC stores it encrypted and never sends
        it back. Sync runs on the server.
      </p>

      {connection.isPending && (
        <p className="text-sm text-arc-text-muted">Checking connection…</p>
      )}

      {connected && (
        <dl className="space-y-1 font-mono text-sm text-arc-text-muted">
          <div className="flex justify-between gap-4">
            <dt>Token</dt>
            <dd className="text-arc-text">{connection.data.token_hint || 'Saved'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Last successful sync</dt>
            <dd className="text-arc-text">
              {formatInstant(connection.data.last_sync_at)}
            </dd>
          </div>
          {lastError && (
            <div className="flex justify-between gap-4 text-arc-danger-light">
              <dt>Last error</dt>
              <dd>{lastError}</dd>
            </div>
          )}
        </dl>
      )}

      {banner && (
        <p
          className={`rounded-[10px] px-3 py-2 text-sm ${
            banner.tone === 'error'
              ? 'bg-arc-danger/20 text-arc-danger-light'
              : 'bg-arc-accent/20 text-arc-accent'
          }`}
        >
          {banner.text}
        </p>
      )}

      <form onSubmit={onSave} className="space-y-3">
        <label className="block text-sm text-arc-text-secondary">
          API token
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={connected ? 'Paste a replacement token' : 'Canvas API token'}
            className="mt-1 h-[44px] w-full rounded-[10px] bg-[#1D4074] px-3 text-arc-text outline-none placeholder:text-arc-text-secondary"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy || token.trim().length < 20}
            className="h-[40px] rounded-[10px] bg-arc-accent px-4 text-sm font-semibold text-black disabled:opacity-60"
          >
            {saveConnection.isPending ? 'Saving…' : connected ? 'Replace token' : 'Save token'}
          </button>
          <button
            type="button"
            onClick={onTest}
            disabled={busy || !connected}
            className="h-[40px] rounded-[10px] border border-[#4a496b] px-4 text-sm disabled:opacity-60"
          >
            {testConnection.isPending ? 'Testing…' : 'Test'}
          </button>
          <button
            type="button"
            onClick={onSync}
            disabled={busy || !connected}
            className="h-[40px] rounded-[10px] border border-[#4a496b] px-4 text-sm disabled:opacity-60"
          >
            {sync.isPending ? 'Syncing…' : 'Sync'}
          </button>
          {connected && (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={busy}
              className="h-[40px] rounded-[10px] border border-arc-danger px-4 text-sm text-arc-danger-light disabled:opacity-60"
            >
              Disconnect
            </button>
          )}
        </div>
      </form>
    </section>
  )
}

function AccountPanel() {
  const settings = useSchedulerSettings()
  const selected = settings.data?.flavour ?? null
  const [banner, setBanner] = useState(null)

  async function choose(flavour) {
    if (flavour === selected) return
    setBanner(null)
    try {
      await settings.setFlavour(flavour)
    } catch {
      setBanner({
        tone: 'error',
        text: 'Scheduler preference could not be saved.',
      })
    }
  }

  return (
    <section className="space-y-4 rounded-[15px] border border-[#4a496b] bg-arc-panel p-5">
      <h2 className="text-lg font-semibold">Scheduler intensity</h2>
      <p className="text-sm text-arc-text-secondary">
        Locked-In and Monk use the same setting as Timeline. Changing it here
        reschedules your plan.
      </p>

      {settings.isPending && (
        <p className="text-sm text-arc-text-muted">Loading scheduler settings…</p>
      )}

      {settings.isError && (
        <p className="text-sm text-arc-danger-light" role="alert">
          Scheduler settings could not load.
        </p>
      )}

      {banner && (
        <p className="rounded-[10px] bg-arc-danger/20 px-3 py-2 text-sm text-arc-danger-light">
          {banner.text}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {FLAVOURS.map((mode) => (
          <button
            key={mode.value}
            type="button"
            aria-pressed={selected === mode.value}
            disabled={settings.saving || settings.isPending}
            onClick={() => choose(mode.value)}
            className={`rounded-[10px] border px-4 py-3 text-left disabled:opacity-60 ${
              selected === mode.value
                ? 'border-arc-accent bg-arc-accent/15'
                : 'border-[#4a496b]'
            }`}
          >
            <strong className="block text-arc-text">{mode.title}</strong>
            <span className="mt-1 block text-sm text-arc-text-secondary">
              {mode.description}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

export default function SettingsPage() {
  const [tab, setTab] = useState('integration')

  return (
    <div className="mx-auto max-w-2xl px-6 pb-16 pt-24">
      <header className="mb-8">
        <h1 className="font-display text-3xl text-arc-text">Settings</h1>
        <p className="mt-2 text-sm text-arc-text-secondary">
          Canvas connection and scheduler intensity.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Settings sections"
        className="mb-6 flex gap-1 rounded-[28px] border border-[#4a496b] bg-arc-panel p-1"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`h-[26px] flex-1 rounded-[28px] text-[15px] transition-colors ${
              tab === item.id
                ? 'bg-arc-blue text-arc-text'
                : 'text-arc-text hover:bg-arc-blue/30'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'integration' ? <IntegrationPanel /> : <AccountPanel />}
    </div>
  )
}
