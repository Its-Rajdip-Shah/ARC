import { useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react'

import arcLogo from '../../assets/brand/arc-logo.svg'
import { subjectLabel } from '../../lib/subjectLabel'

import SchedulerRunButton from './SchedulerRunButton'

export default function TimelineSidebar({
  roots,
  selected,
  toggle,
  navigatorVisible = false,
  toggleNavigatorPanel,
  loading,
  error,
  retry,
  schedulerRuntime,
  actions,
  rootLeafIndex = new Map(),
  currentLeafByRoot = {},
  navigateRoot,
  deselectRoots,
  overdueActive = false,
  overdueSections = [],
  toggleOverdue,
  toggleOverdueSection,
  overdueNavigation = { count: 0, index: -1, navigate() {} },
}) {
  const [
    subjectsOpen,
    setSubjectsOpen,
  ] = useState(false)

  return (
    <aside
      className={`
        timeline-sidebar
        fixed left-0 top-0 z-30
        flex h-dvh min-h-0 w-arc-sidebar
        flex-col overflow-hidden
        overscroll-contain
        border-r border-white/10
        bg-arc-surface
        px-5 pb-6 pt-5
        ${subjectsOpen ? '' : 'is-subjects-closed'}
      `}
      aria-label="Timeline root filters"
    >
      <img
        src={arcLogo}
        alt="ARC"
        className="hidden h-auto w-[92px] md:block"
      />

      <button
        type="button"
        className="
          mb-3 flex min-h-11 w-full
          items-center justify-between
          px-3 py-2 text-left
          text-[26.4px] font-bold
          tracking-[0.12em]
          text-arc-text-secondary
          md:hidden
        "
        aria-expanded={subjectsOpen}
        aria-controls="timeline-subjects"
        onClick={() =>
          setSubjectsOpen(
            (open) => !open,
          )
        }
      >
        Roots
        <span
          aria-hidden="true"
          className="text-sm tracking-normal"
        >
          {subjectsOpen ? '▾' : '▸'}
        </span>
      </button>

      <nav
        aria-label="Filter by root goal"
        className="flex min-h-0 flex-1 flex-col md:mt-20"
      >
        <div className="mb-[6px] hidden items-center justify-between md:flex">
          <h2
            className="
              pl-3 text-[22px] font-bold leading-tight
              tracking-[0.12em]
              text-arc-text-secondary
            "
          >
            Roots
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            {selected.length > 0 && (
              <button
                type="button"
                aria-label={navigatorVisible ? 'Hide Root Tasks panel' : 'Show Root Tasks panel'}
                title={navigatorVisible ? 'Hide Root Tasks panel' : 'Show Root Tasks panel'}
                aria-pressed={navigatorVisible}
                onClick={toggleNavigatorPanel}
                className="grid h-7 w-7 place-items-center rounded-arc-sm text-arc-text-secondary hover:bg-white/10"
              >
                {navigatorVisible ? <Eye size={17} /> : <EyeOff size={17} />}
              </button>
            )}
            {selected.length > 1 && selected.length < roots.length && (
              <button
                type="button"
                aria-label="Deselect all"
                title="Deselect all roots"
                className="timeline-roots-clear"
                onClick={deselectRoots}
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="mb-[6px]">
          <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <button
            type="button"
            aria-pressed={overdueActive}
            onClick={toggleOverdue}
            className={`block min-w-0 w-full whitespace-nowrap rounded-arc-sm px-3 py-2 text-left text-sm text-arc-danger-light transition-colors hover:bg-white/5 ${
              overdueActive ? 'bg-white/10 font-semibold' : ''
            }`}
          >
            Overdue
          </button>
          {overdueActive && (
              <div
                className="timeline-root-navigation !m-0 !p-0 !w-auto !max-w-none flex items-center justify-end gap-0"
                role="group"
                aria-label="Overdue task navigation"
              >
                <button
                  type="button"
                  className="timeline-root-navigation-arrow"
                  aria-label="Previous overdue task"
                  disabled={!overdueNavigation.count}
                  onClick={() => overdueNavigation.navigate(-1)}
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="timeline-root-navigation-count">
                  {overdueNavigation.count
                    ? `${Math.max(1, overdueNavigation.index + 1)}/${overdueNavigation.count}`
                    : '0/0'}
                </span>
                <button
                  type="button"
                  className="timeline-root-navigation-arrow"
                  aria-label="Next overdue task"
                  disabled={!overdueNavigation.count}
                  onClick={() => overdueNavigation.navigate(1)}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
          )}
          </div>
          {overdueActive && (
              <div role="group" aria-label="Timeline overdue types" className="ml-4 mt-3 space-y-1">
              {[
                ['deadline', 'Deadline'],
                ['anchor', 'Anchored'],
              ].map(([section, label]) => (
                <button
                  key={section}
                  type="button"
                  aria-pressed={overdueSections.includes(section)}
                  onClick={() => toggleOverdueSection(section)}
                  className={`block w-full rounded-arc-sm px-3 py-1.5 text-left text-sm text-arc-danger-light hover:bg-white/5 ${
                    overdueSections.includes(section) ? 'bg-white/10 font-semibold' : ''
                  }`}
                >
                  {label}
                </button>
              ))}
              </div>
          )}
        </div>

        <div
          id="timeline-subjects"
          className="timeline-subject-list min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
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

          {roots.map(
            (root) => {
              const active =
                selected.includes(
                  root.id,
                )

              return (
                <div key={root.id}>
                <button
                  type="button"
                  aria-pressed={
                    active
                  }
                  title={
                    root.title
                  }
                  aria-label={
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
                    whitespace-normal
                    break-words
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
                  <span>
                    {subjectLabel(
                      root.title,
                    )}
                  </span>
                </button>
                </div>
              )
            },
          )}
        </div>
      </nav>

      <div className="timeline-sidebar-scheduler relative z-10 shrink-0">
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
