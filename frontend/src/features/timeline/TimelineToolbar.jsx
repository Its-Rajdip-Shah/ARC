import {
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  Anchor,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleDot,
  Layers,
  Redo2,
  Search,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react'

import monkSettingsIcon from '../../assets/icons/locked-in_monk-mode/monk-mode-hands-down-dark.png'

import editCalendarIcon from '../../assets/icons/edit-calendar.svg'

import { BUCKETS } from './timelineDates'
import DurationGlyph from './DurationGlyph'

function IconButton({
  label,
  children,
  ...props
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  )
}

function SequenceToggle({
  label,
  active,
  count,
  index,
  onToggle,
  onPrevious,
  onNext,
  children,
}) {
  return (
    <div className="timeline-sequence-toggle">
      <IconButton
        label={label}
        aria-pressed={
          active
        }
        onClick={
          onToggle
        }
      >
        {children}
      </IconButton>

      {active && (
        <div
          className="timeline-sequence-controls"
          aria-label={
            `${label} navigation`
          }
        >
          <span role="status">
            {
              index >= 0
                ? index + 1
                : 0
            }
            /
            {count}
          </span>

          <IconButton
            label={`Previous ${label.toLowerCase()}`}
            disabled={
              count === 0
            }
            onClick={
              onPrevious
            }
          >
            <ArrowUp
              size={13}
            />
          </IconButton>

          <IconButton
            label={`Next ${label.toLowerCase()}`}
            disabled={
              count === 0
            }
            onClick={
              onNext
            }
          >
            <ArrowDown
              size={13}
            />
          </IconButton>
        </div>
      )}
    </div>
  )
}


function HoverPicker({
  label,
  value,
  options,
  onChange,
}) {
  const [
    open,
    setOpen,
  ] = useState(false)

  const trigger =
    useRef(null)

  const hoverTimer =
    useRef(null)

  useEffect(
    () => () => {
      if (
        hoverTimer.current
      ) {
        clearTimeout(
          hoverTimer.current,
        )
      }
    },
    [],
  )

  function delayedOpen() {
    if (
      hoverTimer.current
    ) {
      clearTimeout(
        hoverTimer.current,
      )
    }

    hoverTimer.current =
      setTimeout(
        () =>
          setOpen(true),
        180,
      )
  }

  function cancelDelayedOpen() {
    if (
      hoverTimer.current
    ) {
      clearTimeout(
        hoverTimer.current,
      )

      hoverTimer.current =
        null
    }
  }

  const selected =
    options.find(
      (option) =>
        option.value ===
        value,
    ) ??
    options[0]

  return (
    <div
      className="timeline-picker"
      onMouseEnter={
        delayedOpen
      }
      onMouseLeave={(event) => {
        cancelDelayedOpen()

        if (
          !event.currentTarget.contains(
            document.activeElement,
          )
        ) {
          setOpen(false)
        }
      }}
      onFocus={() =>
        setOpen(true)
      }
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(
            event.relatedTarget,
          )
        ) {
          setOpen(false)
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() =>
          setOpen(
            (current) =>
              !current,
          )
        }
      >
        {selected.label} ▾
      </button>

      {open && (
        <div
          className="
            timeline-popover
            timeline-picker-options
          "
          role="group"
          aria-label={label}
        >
          {options.map(
            (option) => (
              <button
                key={
                  option.value
                }
                type="button"
                aria-pressed={
                  option.value ===
                  value
                }
                onClick={() => {
                  onChange(
                    option.value,
                  )

                  trigger.current
                    ?.focus()

                  setOpen(false)
                }}
              >
                {option.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

function DurationPicker({
  selected = [],
  onChange,
}) {
  const [
    open,
    setOpen,
  ] = useState(false)

  const values =
    new Set(
      selected.length
        ? selected
        : BUCKETS.map(
            (bucket) =>
              bucket.key,
          ),
    )

  function toggle(key) {
    const next =
      new Set(values)

    if (
      next.has(key)
    ) {
      // Keep at least one category selected.
      if (
        next.size === 1
      ) {
        return
      }

      next.delete(key)
    } else {
      next.add(key)
    }

    onChange(
      BUCKETS
        .map(
          (bucket) =>
            bucket.key,
        )
        .filter(
          (value) =>
            next.has(value),
        ),
    )
  }

  return (
    <div
      className="
        timeline-picker
        timeline-duration-picker
      "
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(
            event.relatedTarget,
          )
        ) {
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        aria-label="Estimated duration"
        aria-expanded={open}
        onClick={() =>
          setOpen(
            (current) =>
              !current,
          )
        }
      >
        <DurationGlyph
          level={
            Math.max(
              1,
              Math.min(
                6,
                values.size,
              ),
            )
          }
        />

        <span>
          {
            values.size === 6
              ? 'All'
              : `${values.size}/6`
          }
        </span>

        ▾
      </button>

      {open && (
        <div
          className="
            timeline-popover
            timeline-duration-matrix
          "
          role="group"
          aria-label="Estimated duration filters"
        >
          {BUCKETS.map(
            (bucket) => (
              <button
                key={
                  bucket.key
                }
                type="button"
                aria-pressed={
                  values.has(
                    bucket.key,
                  )
                }
                onClick={() =>
                  toggle(
                    bucket.key,
                  )
                }
              >
                <DurationGlyph
                  level={
                    bucket.level
                  }
                />

                <span>
                  {
                    bucket.shortLabel
                  }
                </span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

function ZoomPicker({
  value,
  onChange,
}) {
  return (
    <HoverPicker
      label="Timeline scale"
      value={value}
      onChange={onChange}
      options={[
        {
          value: 'day',
          label: 'Day',
        },
        {
          value: 'week',
          label: 'Week',
        },
        {
          value: 'month',
          label: 'Month',
        },
      ]}
    />
  )
}

export default function TimelineToolbar({
  find,
  actions,
  anchor,
  zoom,
  setZoom,
  navigate,
  jump,
  options,
  update,
  settingsOpen,
  toggleSettings,
  openSettings,
  anchorNav,
  overloadNav,
  infeasibleNav,
  onEditTimezones,
}) {
  const [
    calendarOpen,
    setCalendarOpen,
  ] = useState(false)

  return (
    <div
      className="timeline-tools"
      role="group"
      aria-label="Timeline tools"
    >
      <div className="timeline-find">
        <Search
          size={14}
          aria-hidden="true"
        />

        <input
          type="search"
          aria-label="Search Timeline items"
          placeholder="Search…"
          value={find.query}
          onChange={(event) =>
            find.changeQuery(
              event.target.value,
            )
          }
          onKeyDown={(event) => {
            if (
              event.key === 'Enter'
            ) {
              event.preventDefault()

              find.navigate(
                event.shiftKey
                  ? -1
                  : 1,
              )
            }

            if (
              event.key === 'Escape'
            ) {
              find.changeQuery('')
            }
          }}
        />

        {find.query && (
          <>
            <span role="status">
              {
                find.matches.length
                  ? find.index + 1
                  : 0
              }
              /
              {
                find.matches.length
              }
            </span>

            <IconButton
              label="Previous match"
              disabled={
                !find.matches.length
              }
              onClick={() =>
                find.navigate(-1)
              }
            >
              <ArrowUp size={13} />
            </IconButton>

            <IconButton
              label="Next match"
              disabled={
                !find.matches.length
              }
              onClick={() =>
                find.navigate(1)
              }
            >
              <ArrowDown size={13} />
            </IconButton>

            <IconButton
              label="Clear search"
              onClick={() =>
                find.changeQuery('')
              }
            >
              <X size={13} />
            </IconButton>
          </>
        )}
      </div>

      <IconButton
        label="Previous period"
        onClick={() =>
          navigate(-1)
        }
      >
        <ChevronLeft size={16} />
      </IconButton>

      <IconButton
        label="Today"
        onClick={() =>
          jump()
        }
      >
        <CircleDot size={16} />
      </IconButton>

      <IconButton
        label="Next period"
        onClick={() =>
          navigate(1)
        }
      >
        <ChevronRight size={16} />
      </IconButton>

      <div
        className="timeline-calendar"
        onBlur={(event) => {
          if (
            !event.currentTarget.contains(
              event.relatedTarget,
            )
          ) {
            setCalendarOpen(false)
          }
        }}
      >
        <IconButton
          label="Jump to date"
          aria-expanded={
            calendarOpen
          }
          onClick={() =>
            setCalendarOpen(
              (current) =>
                !current,
            )
          }
        >
          <CalendarDays size={16} />
        </IconButton>

        {calendarOpen && (
          <div className="timeline-popover">
            <input
              type="date"
              aria-label="Jump to date"
              value={anchor}
              onChange={(event) => {
                if (
                  event.target.value
                ) {
                  jump(
                    event.target.value,
                  )
                }
              }}
            />
          </div>
        )}
      </div>

      <ZoomPicker
        value={zoom}
        onChange={setZoom}
      />

      <HoverPicker
        label="Item type"
        value={options.type}
        onChange={(type) =>
          update({ type })
        }
        options={[
          {
            value: 'all',
            label: 'All',
          },
          {
            value: 'tasks',
            label: 'Tasks',
          },
          {
            value: 'assignments',
            label: 'Assignments',
          },
        ]}
      />

      <DurationPicker
        selected={
          options.durations
        }
        onChange={(durations) =>
          update({
            durations,
          })
        }
      />

      <IconButton
        label="Group by goal"
        aria-pressed={
          options.grouped
        }
        onClick={() =>
          update({
            grouped:
              !options.grouped,
          })
        }
      >
        <Layers size={16} />
      </IconButton>

      <IconButton
        label="Show completed"
        aria-pressed={
          options.completed
        }
        onClick={() =>
          update({
            completed:
              !options.completed,
          })
        }
      >
        <CircleCheck size={16} />
      </IconButton>

      <SequenceToggle
        label="Anchored tasks"
        active={
          anchorNav.active
        }
        count={
          anchorNav.count
        }
        index={
          anchorNav.index
        }
        onToggle={
          anchorNav.toggle
        }
        onPrevious={() =>
          anchorNav.navigate(-1)
        }
        onNext={() =>
          anchorNav.navigate(1)
        }
      >
        <Anchor size={16} />
      </SequenceToggle>

      <SequenceToggle
        label="Overloaded dates"
        active={
          overloadNav.active
        }
        count={
          overloadNav.count
        }
        index={
          overloadNav.index
        }
        onToggle={
          overloadNav.toggle
        }
        onPrevious={() =>
          overloadNav.navigate(-1)
        }
        onNext={() =>
          overloadNav.navigate(1)
        }
      >
        <span
          className="timeline-toolbar-overload-dot"
          aria-hidden="true"
        />
      </SequenceToggle>

      <SequenceToggle
        label="Infeasible dates"
        active={
          infeasibleNav.active
        }
        count={
          infeasibleNav.count
        }
        index={
          infeasibleNav.index
        }
        onToggle={
          infeasibleNav.toggle
        }
        onPrevious={() =>
          infeasibleNav.navigate(-1)
        }
        onNext={() =>
          infeasibleNav.navigate(1)
        }
      >
        <TriangleAlert
          size={16}
        />
      </SequenceToggle>

      <IconButton
        label="Manage timezones"
        onClick={
          onEditTimezones
        }
      >
        <img
          src={editCalendarIcon}
          alt=""
          className="timeline-toolbar-image-icon"
        />
      </IconButton>

      <IconButton
        label="Scheduler settings"
        onDoubleClick={openSettings}
        aria-expanded={
          settingsOpen
        }
        onClick={
          toggleSettings
        }
      >
        <img src={monkSettingsIcon} alt="" className="timeline-scheduler-mode-icon" />
      </IconButton>

      <IconButton
        label="Undo"
        disabled={
          actions.busy ||
          !actions.history.data
            ?.can_undo
        }
        onClick={() =>
          actions
            .run('undo')
            .catch(() => {})
        }
      >
        <Undo2 size={16} />
      </IconButton>

      <IconButton
        label="Redo"
        disabled={
          actions.busy ||
          !actions.history.data
            ?.can_redo
        }
        onClick={() =>
          actions
            .run('redo')
            .catch(() => {})
        }
      >
        <Redo2 size={16} />
      </IconButton>
    </div>
  )
}
