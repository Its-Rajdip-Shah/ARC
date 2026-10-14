import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import arcLogo from '../../assets/brand/arc-logo.svg'
import { subjectLabel } from '../../lib/subjectLabel'

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
  rootLeafIndex = new Map(),
  currentLeafByRoot = {},
  navigateRoot,
  deselectRoots,
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
        flex h-screen w-arc-sidebar
        flex-col overflow-y-auto
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
          text-[22px] font-bold
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
        className="md:mt-20"
      >
        <div className="mb-3 hidden px-3 md:block">
          <h2
            className="
              text-[22px] font-bold
              tracking-[0.12em]
              text-arc-text-secondary
            "
          >
            Roots
          </h2>
        </div>

        {selected.length > 1 && selected.length < roots.length && (
          <button type="button" className="timeline-deselect-roots" onClick={deselectRoots}>Deselect all</button>
        )}
        <div
          id="timeline-subjects"
          className="timeline-subject-list space-y-1"
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

              const entries = rootLeafIndex.get(root.id) ?? []
              const navigable = entries.filter((entry) => entry.date != null)
              const position = navigable.length ? Math.max(1, navigable.findIndex((entry) => entry.id === currentLeafByRoot[root.id]) + 1) : 0
              const missing = entries.length - navigable.length
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
                {active && (
                  <div className="timeline-root-navigation" role="group" aria-label={`Tasks in ${root.title}`}>
                    <button type="button" className="timeline-root-navigation-arrow" disabled={!navigable.length} aria-label={`Previous task in ${root.title}`} onClick={(event) => { event.stopPropagation(); navigateRoot(root.id, -1) }}><ChevronLeft size={14} /></button>
                    <span className="timeline-root-navigation-count">{position}/{navigable.length}</span>
                    <button type="button" className="timeline-root-navigation-arrow" disabled={!navigable.length} aria-label={`Next task in ${root.title}`} onClick={(event) => { event.stopPropagation(); navigateRoot(root.id, 1) }}><ChevronRight size={14} /></button>
                  </div>
                )}
                {active && missing > 0 && <small className="timeline-root-navigation-missing">{missing} schedule unavailable</small>}
                </div>
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
