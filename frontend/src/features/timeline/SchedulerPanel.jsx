import { useSchedulerSettings } from '../../hooks/useSchedulerSettings'

const MODES = [
  {
    value: 'lock-in',
    title: 'Lock-in',
    description: 'Push harder toward deadlines and use available time more aggressively.',
  },
  {
    value: 'monk',
    title: 'Monk',
    description: 'Prefer a calmer schedule with lower daily intensity where deadlines allow it.',
  },
]

function RuntimeSummary({ runtime }) {
  if (!runtime?.configured) {
    return (
      <div className="scheduler-runtime-summary">
        <strong>Scheduler inactive</strong>
        <p>Choose a mode to activate the production scheduler.</p>
      </div>
    )
  }

  return (
    <div className="scheduler-runtime-summary">
      <div>
        <span>Engine</span>
        <strong>{runtime.engine_version ?? '—'}</strong>
      </div>
      <div>
        <span>Iterations</span>
        <strong>{runtime.iterations ?? '—'}</strong>
      </div>
      <div>
        <span>Evaluations</span>
        <strong>{runtime.evaluations ?? '—'}</strong>
      </div>
      <div>
        <span>Sessions</span>
        <strong>{runtime.allocations?.length ?? runtime.allocation_count ?? 0}</strong>
      </div>
    </div>
  )
}

export default function SchedulerPanel({ runtime, close }) {
  const settings = useSchedulerSettings()

  const selected =
    settings.data?.flavour ??
    null

  async function choose(flavour) {
    if (
      flavour ===
      selected
    ) {
      return
    }

    try {
      await settings.setFlavour(
        flavour,
      )
    } catch {
      // Mutation error is rendered below.
    }
  }

  return (
    <section
      className="timeline-settings scheduler-settings"
      aria-label="Scheduler settings"
    >
      <div className="scheduler-settings-heading">
        <div>
          <strong>Scheduler</strong>
          <p>
            Choose how ARC should distribute your work. No mode is selected
            automatically.
          </p>
        </div>
        <button type="button" onClick={close}>
          Close
        </button>
      </div>

      {settings.isPending ? (
        <p role="status">Loading scheduler settings…</p>
      ) : settings.isError ? (
        <p className="timeline-error" role="alert">
          Scheduler settings could not load.
          {' '}
          <button type="button" onClick={() => settings.refetch()}>
            Retry
          </button>
        </p>
      ) : (
        <>
          <div className="scheduler-mode-options">
            {MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                className={
                  'scheduler-mode-option ' +
                  (selected === mode.value ? 'scheduler-mode-selected' : '')
                }
                aria-pressed={selected === mode.value}
                disabled={settings.saving}
                onClick={() => choose(mode.value)}
              >
                <span>
                  <strong>{mode.title}</strong>
                  {selected === mode.value && <em>Selected</em>}
                </span>
                <small>{mode.description}</small>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="scheduler-clear-button"
            disabled={settings.saving || selected == null}
            onClick={() => choose(null)}
          >
            {settings.saving ? 'Saving…' : 'Turn scheduler off'}
          </button>

          {settings.saveError && (
            <p className="timeline-error" role="alert">
              Scheduler preference could not be saved.
            </p>
          )}

          <RuntimeSummary runtime={runtime} />
        </>
      )}
    </section>
  )
}
