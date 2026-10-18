import { useSchedulerSettings } from '../../hooks/useSchedulerSettings'

const MODES = [
  { value: 'monk', title: 'Monk' },
  { value: 'lock-in', title: 'Locked-in' },
]

export default function SchedulerPanel({ close }) {
  const settings = useSchedulerSettings()
  const selected = settings.data?.flavour ?? null

  async function choose(flavour) {
    if (settings.saving) return

    if (flavour === selected) {
      close()
      return
    }

    try {
      await settings.setFlavour(flavour)
      close()
    } catch {
      // Keep the dropdown open so the save error remains visible.
    }
  }

  return (
    <section
      className="timeline-settings scheduler-settings scheduler-mode-dropdown"
      aria-label="Scheduler settings"
    >
      {settings.isPending ? (
        <p role="status">Loading…</p>
      ) : settings.isError ? (
        <p role="alert" className="timeline-error">
          Could not load modes.
          <button type="button" onClick={() => settings.refetch()}>
            Retry
          </button>
        </p>
      ) : (
        <>
          {MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              className={
                'scheduler-dropdown-option' +
                (selected === mode.value ? ' is-selected' : '')
              }
              aria-pressed={selected === mode.value}
              disabled={settings.saving}
              onClick={() => choose(mode.value)}
            >
              <span className="scheduler-dropdown-check" aria-hidden="true">
                {selected === mode.value ? '✓' : ''}
              </span>
              <span>{mode.title}</span>
            </button>
          ))}

          {settings.saveError && (
            <p role="alert" className="timeline-error">
              Could not save scheduler mode.
            </p>
          )}
        </>
      )}
    </section>
  )
}
