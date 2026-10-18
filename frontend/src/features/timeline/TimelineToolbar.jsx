import { createPortal } from 'react-dom'

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
  RotateCcw,
} from 'lucide-react'

import monkSettingsIcon from '../../assets/icons/locked-in_monk-mode/monk-mode-hands-down-dark.png'

import editCalendarIcon from '../../assets/icons/edit-calendar.svg'

import { BUCKETS } from './timelineDates'
import DurationGlyph from './DurationGlyph'
import ArcDateCalendar from '../../components/ArcDateCalendar'
import SchedulerPanel from './SchedulerPanel'

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



// One controller owns all toolbar dropdowns. Hover previews a menu;
// clicking pins it, and selecting an option may optionally close it.
function useToolbarDropdown() {
  const HOVER_DELAY_MS = 220

  const [active, setActive] = useState(null)
  const [pinned, setPinned] = useState(false)
  const rootRef = useRef(null)
  const hoverTimer = useRef(null)

  function cancelHover() {
    if (hoverTimer.current !== null) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
  }

  function close() {
    cancelHover()
    setActive(null)
    setPinned(false)
  }

  function enter(id) {
    cancelHover()

    // A pinned menu cannot be displaced by passing over another button.
    if (pinned || active === id) return

    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = null
      setActive(id)
    }, HOVER_DELAY_MS)
  }

  function leave(id) {
    cancelHover()

    if (!pinned) {
      setActive((current) => current === id ? null : current)
    }
  }

  function toggle(id) {
    cancelHover()

    if (active === id && pinned) {
      close()
    } else {
      setActive(id)
      setPinned(true)
    }
  }

  function select(closeOnSelect = true) {
    if (closeOnSelect) close()
  }

  useEffect(() => {
    function outside(event) {
      if (!rootRef.current?.contains(event.target)) close()
    }

    function escape(event) {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)

    return () => {
      cancelHover()
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [])

  return {
    active,
    pinned,
    rootRef,
    close,
    enter,
    leave,
    toggle,
    select,
  }
}

function ToolbarDropdown({
  id,
  label,
  trigger,
  controller,
  children,
  className = '',
  closeOnSelect = true,
}) {
  const open = controller.active === id
  const triggerRef = useRef(null)
  const tooltipTimer = useRef(null)
  const [tooltipPosition, setTooltipPosition] = useState(null)

  function hideTooltip() {
    if (tooltipTimer.current !== null) {
      clearTimeout(tooltipTimer.current)
      tooltipTimer.current = null
    }
    setTooltipPosition(null)
  }

  function showTooltipAfterDelay() {
    if (tooltipTimer.current !== null) {
      clearTimeout(tooltipTimer.current)
    }

    tooltipTimer.current = setTimeout(() => {
      tooltipTimer.current = null

      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return

      setTooltipPosition({
        left: rect.left + rect.width / 2,
        top: rect.top - 9,
      })
    }, 450)
  }

  useEffect(() => {
    return () => {
      if (tooltipTimer.current !== null) {
        clearTimeout(tooltipTimer.current)
      }
    }
  }, [])

  return (
    <div
      className={'timeline-picker timeline-dropdown-host ' + className}
      onMouseEnter={() => controller.enter(id)}
      onMouseLeave={() => {
        controller.leave(id)
        hideTooltip()
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          controller.leave(id)
          hideTooltip()
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onMouseEnter={showTooltipAfterDelay}
        onMouseLeave={hideTooltip}
        onFocus={() => controller.enter(id)}
        onBlur={hideTooltip}
        onClick={() => controller.toggle(id)}
      >
        {trigger}
      </button>

      {tooltipPosition && createPortal(
        <span
          role="tooltip"
          className="timeline-dropdown-floating-tooltip"
          style={{
            left: tooltipPosition.left,
            top: tooltipPosition.top,
          }}
        >
          {label}
        </span>,
        document.body,
      )}

      {open && (
        <div
          className="timeline-popover timeline-dropdown-content"
          role="group"
          aria-label={label + ' options'}
          onClick={(event) => {
            if (event.target.closest('[data-dropdown-select]')) {
              controller.select(closeOnSelect)
            }
          }}
        >
          {children}
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
  controller,
}) {
  const selected =
    options.find((option) => option.value === value) ?? options[0]

  return (
    <ToolbarDropdown
      id={label}
      label={label}
      trigger={<>{selected.label} ▾</>}
      controller={controller}
    >
      <div className="timeline-picker-options">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            data-dropdown-select
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </ToolbarDropdown>
  )
}

function DurationPicker({
  selected = [],
  onChange,
  controller,
}) {
  const values = new Set(
    selected.length
      ? selected
      : BUCKETS.map((bucket) => bucket.key),
  )

  function toggle(key) {
    const next = new Set(values)

    if (next.has(key)) {
      if (next.size === 1) return
      next.delete(key)
    } else {
      next.add(key)
    }

    onChange(
      BUCKETS.map((bucket) => bucket.key).filter((key) => next.has(key)),
    )
  }

  return (
    <ToolbarDropdown
      id="Estimated duration"
      label="Estimated duration"
      className="timeline-duration-picker"
      controller={controller}
      closeOnSelect={false}
      trigger={
        <>
          <DurationGlyph level={Math.max(1, Math.min(6, values.size))} />
          <span>{values.size === 6 ? 'All' : `${values.size}/6`}</span>
          ▾
        </>
      }
    >
      <div className="timeline-duration-matrix">
        {BUCKETS.map((bucket) => (
          <button
            key={bucket.key}
            type="button"
            aria-pressed={values.has(bucket.key)}
            data-dropdown-select
            onClick={() => toggle(bucket.key)}
          >
            <DurationGlyph level={bucket.level} />
            <span>{bucket.shortLabel}</span>
          </button>
        ))}
      </div>
    </ToolbarDropdown>
  )
}

function ZoomPicker({ value, onChange, controller }) {
  return (
    <HoverPicker
      label="Timeline scale"
      value={value}
      onChange={onChange}
      controller={controller}
      options={[
        { value: 'day', label: 'Day' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
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
  onReset,
  options,
  update,
  anchorNav,
  overloadNav,
  infeasibleNav,
  onEditTimezones,
}) {
  const dropdown = useToolbarDropdown()

  return (
    <div
      ref={dropdown.rootRef}
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
        label="Reset filters"
        onClick={onReset}
        disabled={!onReset}
      >
        <RotateCcw size={16} />
      </IconButton>

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

      <ToolbarDropdown
        id="Jump to date"
        label="Jump to date"
        trigger={<CalendarDays size={16} />}
        controller={dropdown}
        className="timeline-calendar"
      >
        <ArcDateCalendar
          anchor={anchor}
          onChoose={(date) => jump(date)}
        />
      </ToolbarDropdown>

      <ZoomPicker
        value={zoom}
        onChange={setZoom}
        controller={dropdown}
      />

      <HoverPicker
        label="Item type"
        controller={dropdown}
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
        controller={dropdown}
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
        label="Manage date ranges"
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

      <ToolbarDropdown
        id="Scheduler settings"
        label="Scheduler settings"
        controller={dropdown}
        className="timeline-scheduler-dropdown-host"
        trigger={
          <img
            src={monkSettingsIcon}
            alt=""
            className="timeline-scheduler-mode-icon"
          />
        }
      >
        <SchedulerPanel close={dropdown.close} />
      </ToolbarDropdown>

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
