import arcLogo from '../../assets/brand/arc-logo.svg'

import SchedulerRunButton from './SchedulerRunButton'

export default function TimelineSidebar({
  roots,
  selected,
  toggle,
  loading,
  error,
  retry,
  schedulerRuntime,
  actions,
}) {
  return (
    <aside
      className="
        timeline-sidebar
        fixed left-0 top-0 z-30
        flex h-screen w-arc-sidebar
        flex-col overflow-y-auto
        overscroll-contain
        border-r border-white/10
        bg-arc-surface
        px-5 pb-6 pt-5
      "
      aria-label="Timeline root filters"
    >
      <img
        src={arcLogo}
        alt="ARC"
        className="h-auto w-[92px]"
      />

      <nav
        aria-label="Filter by root goal"
        className="mt-20"
      >
        <div className="mb-3 px-3">
          <h2
            className="
              text-[22px] font-bold
              tracking-[0.12em]
              text-arc-text-secondary
            "
          >
            ROOTS
          </h2>
        </div>

        {loading && (
          <p
            role="status"
            className="px-3 text-sm"
          >
            Loading roots…
          </p>
        )}

        {error && (
          <button
            type="button"
            className="
              mx-3 rounded-arc-sm
              px-3 py-2 text-sm
            "
            onClick={retry}
          >
            Retry root list
          </button>
        )}

        <div className="space-y-1">
          {roots.map(
            (root) => {
              const active =
                selected.includes(
                  root.id,
                )

              return (
                <button
                  key={root.id}
                  type="button"
                  aria-pressed={
                    active
                  }
                  title={
                    root.title
                  }
                  onClick={() =>
                    toggle(
                      root.id,
                    )
                  }
                  className={`
                    block w-full
                    rounded-arc-sm
                    px-3 py-2
                    text-left
                    text-sm
                    text-arc-text
                    transition-colors
                    hover:bg-white/5
                    ${
                      active
                        ? 'bg-white/10 font-semibold'
                        : ''
                    }
                  `}
                >
                  {
                    root.title.length >
                    30
                      ? `${root.title.slice(0, 30)}...`
                      : root.title
                  }
                </button>
              )
            },
          )}
        </div>
      </nav>

      <div className="timeline-sidebar-scheduler">
        <SchedulerRunButton
          runtime={
            schedulerRuntime
          }
          actions={
            actions
          }
        />
      </div>
    </aside>
  )
}
