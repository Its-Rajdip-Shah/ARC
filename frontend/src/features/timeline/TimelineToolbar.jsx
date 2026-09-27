import { useRef, useState } from 'react'
import { ArrowUp, ArrowDown, Search, X, ChevronLeft, ChevronRight, CircleDot, CalendarDays, SlidersHorizontal, Layers, CircleCheck, CalendarRange, Undo2, Redo2, RefreshCw } from 'lucide-react'

function IconButton({ label, children, ...props }) {
  return <button type="button" title={label} aria-label={label} {...props}>{children}</button>
}
function HoverPicker({ label, value, options, onChange, renderValue }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef(null)
  const id = `timeline-${label.toLowerCase().replaceAll(' ', '-')}-options`

  const selected = options.find((option) => option.value === value) ?? options[0]

  return <div
    className="timeline-picker"
    onMouseEnter={() => setOpen(true)}
    onMouseLeave={(e) => {
      if (!e.currentTarget.contains(document.activeElement)) setOpen(false)
    }}
    onFocus={() => setOpen(true)}
    onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
    }}
    onKeyDown={(e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        trigger.current?.focus()
        setOpen(false)
      }
    }}
  >
    <button
      ref={trigger}
      type="button"
      aria-label={label}
      aria-expanded={open}
      aria-controls={id}
      onClick={() => setOpen(true)}
    >
      {renderValue ? renderValue(selected) : selected.label} ▾
    </button>

    {open && <div id={id} className="timeline-popover timeline-picker-options" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => {
            onChange(option.value)
            trigger.current?.focus()
            setOpen(false)
          }}
        >
          {renderValue ? renderValue(option) : option.label}
        </button>
      ))}
    </div>}
  </div>
}

function DurationDots({ count }) {
  if (count === 6) {
    return <span className="timeline-duration-filter-icon timeline-duration-filter-all" aria-hidden="true">
      <i /><i /><i /><i /><i /><i />
    </span>
  }

  return <span className="timeline-duration-filter-icon" aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <i key={index} />)}
  </span>
}

function ZoomPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef(null)
  return <div className="timeline-zoom" onMouseEnter={() => setOpen(true)} onMouseLeave={(e) => { if (!e.currentTarget.contains(document.activeElement)) setOpen(false) }}
    onFocus={() => setOpen(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false) }}
    onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); trigger.current?.focus(); setOpen(false) } }}>
    <button ref={trigger} type="button" aria-label="Timeline scale" aria-expanded={open} aria-controls="timeline-scale-options"
      onClick={() => setOpen(true)}>{value[0].toUpperCase() + value.slice(1)} ▾</button>
    {open && <div id="timeline-scale-options" className="timeline-popover" role="group" aria-label="Timeline scale">
      {['day', 'week', 'month'].map((mode) => <button key={mode} type="button" aria-pressed={mode === value}
        onClick={() => { onChange(mode); trigger.current?.focus(); setOpen(false) }}>{mode[0].toUpperCase() + mode.slice(1)}</button>)}
    </div>}
  </div>
}
export default function TimelineToolbar({ find, actions, anchor, zoom, setZoom, navigate, jump, options, update, settingsOpen, toggleSettings, contextOpen, toggleContext }) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  return <div className="timeline-tools" role="group" aria-label="Timeline tools">
    <div className="timeline-find">
      <Search size={14} aria-hidden="true" />
      <input type="search" aria-label="Find in shown Timeline items" placeholder="Find…" value={find.query}
        onChange={(e) => find.changeQuery(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); find.navigate(e.shiftKey ? -1 : 1) }
          if (e.key === 'Escape') find.changeQuery('')
        }} />
      {find.query && <>
        <span role="status">{find.index + 1}/{find.matches.length}</span>
        <IconButton label="Previous match" disabled={!find.matches.length} onClick={() => find.navigate(-1)}><ArrowUp size={13} /></IconButton>
        <IconButton label="Next match" disabled={!find.matches.length} onClick={() => find.navigate(1)}><ArrowDown size={13} /></IconButton>
        <IconButton label="Clear find" onClick={() => find.changeQuery('')}><X size={13} /></IconButton>
      </>}
    </div>
    <IconButton label="Previous period" onClick={() => navigate(-1)}><ChevronLeft size={16} /></IconButton>
    <IconButton label="Today" onClick={() => jump()}><CircleDot size={16} /></IconButton>
    <IconButton label="Next period" onClick={() => navigate(1)}><ChevronRight size={16} /></IconButton>
    <div className="timeline-calendar" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setCalendarOpen(false) }}
      onKeyDown={(e) => { if (e.key === 'Escape') setCalendarOpen(false) }}>
      <IconButton label="Jump to date" aria-expanded={calendarOpen} onClick={() => setCalendarOpen((s) => !s)}><CalendarDays size={16} /></IconButton>
      {calendarOpen && <div className="timeline-popover"><input type="date" aria-label="Jump to date" value={anchor}
        onChange={(e) => { if (e.target.value) jump(e.target.value) }} /></div>}
    </div>
    <ZoomPicker value={zoom} onChange={setZoom} />
    <HoverPicker
      label="Item type"
      value={options.type}
      onChange={(type) => update({ type })}
      options={[
        { value: 'all', label: 'All' },
        { value: 'tasks', label: 'Tasks' },
        { value: 'assignments', label: 'Assignments' },
      ]}
    />
    <HoverPicker
      label="Estimated duration"
      value={options.duration}
      onChange={(duration) => update({ duration })}
      options={[
        { value: 'all', label: 'All', dots: 6 },
        { value: 'short', label: '<20m', dots: 1 },
        { value: 'medium', label: '20–60m', dots: 2 },
        { value: 'long', label: '>60m', dots: 3 },
      ]}
      renderValue={(option) => <>
        <DurationDots count={option.dots} />
        <span>{option.label}</span>
      </>}
    />
    <IconButton label="Group by goal" aria-pressed={options.grouped} onClick={() => update({ grouped: !options.grouped })}><Layers size={16} /></IconButton>
    <IconButton label="Show completed" aria-pressed={options.completed} onClick={() => update({ completed: !options.completed })}><CircleCheck size={16} /></IconButton>
    <IconButton label="Daily capacity settings" aria-expanded={settingsOpen} onClick={toggleSettings}><SlidersHorizontal size={16} /></IconButton>
    <IconButton label="Context ranges" aria-expanded={contextOpen} onClick={toggleContext}><CalendarRange size={16} /></IconButton>
    <IconButton label="Reschedule" disabled={actions.busy} onClick={() => actions.run('reschedule').catch(() => {})}><RefreshCw size={16} /></IconButton>
    <IconButton label="Undo" disabled={actions.busy || !actions.history.data?.can_undo} onClick={() => actions.run('undo').catch(() => {})}><Undo2 size={16} /></IconButton>
    <IconButton label="Redo" disabled={actions.busy || !actions.history.data?.can_redo} onClick={() => actions.run('redo').catch(() => {})}><Redo2 size={16} /></IconButton>
  </div>
}
