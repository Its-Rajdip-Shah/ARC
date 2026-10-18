import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

function localDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

const MONTHS = Array.from({ length: 12 }, (_, month) =>
  new Date(2024, month, 1).toLocaleDateString('en-AU', {
    month: 'short',
  }),
)

export default function ArcDateCalendar({ anchor, onChoose }) {
  const today = new Date()
  const todayKey = localDateKey(today)

  const initial = /^\d{4}-\d{2}-\d{2}$/.test(anchor || '')
    ? anchor
    : todayKey

  const [year, month] = initial.split('-').map(Number)

  const [view, setView] = useState(
    () => new Date(year, month - 1, 1),
  )

  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [editingYear, setEditingYear] = useState(false)
  const [yearDraft, setYearDraft] = useState(String(year))

  const viewYear = view.getFullYear()
  const viewMonth = view.getMonth()

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()

  const daysInMonth = new Date(
    viewYear,
    viewMonth + 1,
    0,
  ).getDate()

  function moveMonth(amount) {
    setView((current) => new Date(
      current.getFullYear(),
      current.getMonth() + amount,
      1,
    ))
  }

  function jumpToToday() {
    const current = new Date()

    setView(new Date(
      current.getFullYear(),
      current.getMonth(),
      1,
    ))

    setMonthPickerOpen(false)
    setEditingYear(false)
  }

  function chooseMonth(nextMonth) {
    setView(new Date(viewYear, nextMonth, 1))
    setMonthPickerOpen(false)
  }

  function commitYear() {
    const nextYear = Number(yearDraft)

    if (
      /^\d{4}$/.test(yearDraft) &&
      Number.isInteger(nextYear) &&
      nextYear >= 1000 &&
      nextYear <= 9999
    ) {
      const next = new Date(view)
      next.setFullYear(nextYear, viewMonth, 1)
      setView(next)
    }

    setEditingYear(false)
  }

  function choose(day) {
    onChoose([
      viewYear,
      String(viewMonth + 1).padStart(2, '0'),
      String(day).padStart(2, '0'),
    ].join('-'))
  }

  return (
    <div className="timeline-date-calendar">
      <div className="timeline-calendar-header">
        <div className="timeline-calendar-heading">
          <button
            type="button"
            className="timeline-calendar-month-toggle"
            aria-label="Choose month"
            aria-expanded={monthPickerOpen}
            onClick={() => setMonthPickerOpen((open) => !open)}
          >
            {view.toLocaleDateString('en-AU', {
              month: 'long',
            })}
          </button>

          {editingYear ? (
            <input
              autoFocus
              className="timeline-calendar-year-input"
              aria-label="Calendar year"
              inputMode="numeric"
              value={yearDraft}
              onChange={(event) => setYearDraft(event.target.value)}
              onBlur={commitYear}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur()
                }

                if (event.key === 'Escape') {
                  setEditingYear(false)
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="timeline-calendar-year-toggle"
              aria-label="Edit calendar year"
              onClick={() => {
                setYearDraft(String(viewYear))
                setEditingYear(true)
              }}
            >
              {viewYear}
            </button>
          )}
        </div>

        <div className="timeline-calendar-navigation">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => moveMonth(-1)}
          >
            <ChevronLeft size={16} />
          </button>

          <button
            type="button"
            className="timeline-calendar-today-icon"
            aria-label="Today"
            title="Jump to today's month"
            onClick={jumpToToday}
          >
            <span aria-hidden="true" />
          </button>

          <button
            type="button"
            aria-label="Next month"
            onClick={() => moveMonth(1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {monthPickerOpen ? (
        <div className="timeline-calendar-month-picker">
          {MONTHS.map((label, index) => (
            <button
              key={label}
              type="button"
              aria-label={`Select ${label}`}
              aria-pressed={index === viewMonth}
              data-today-month={
                index === today.getMonth() &&
                viewYear === today.getFullYear()
                  ? 'true'
                  : undefined
              }
              onClick={() => chooseMonth(index)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <div className="timeline-calendar-grid">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
            <span key={day} aria-hidden="true">{day}</span>
          ))}

          {Array.from({ length: firstDay }, (_, index) => (
            <span key={'blank-' + index} aria-hidden="true" />
          ))}

          {Array.from({ length: daysInMonth }, (_, index) => {
            const day = index + 1

            const date = [
              viewYear,
              String(viewMonth + 1).padStart(2, '0'),
              String(day).padStart(2, '0'),
            ].join('-')

            return (
              <button
                key={day}
                type="button"
                aria-label={date}
                aria-pressed={date === anchor}
                data-today={
                  date === todayKey ? 'true' : undefined
                }
                data-dropdown-select
                onClick={() => choose(day)}
              >
                {day}
              </button>
            )
          })}
        </div>
      )}

    </div>
  )
}
