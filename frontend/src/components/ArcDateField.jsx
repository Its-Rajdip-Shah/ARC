import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, X } from 'lucide-react'

import ArcDateCalendar from './ArcDateCalendar'
import './ArcDateField.css'

function formatDisplayDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
    return value || ''
  }

  const [year, month, day] = value.split('-').map(Number)

  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return value
  }

  const suffix = (
    day % 100 >= 11 && day % 100 <= 13
  )
    ? 'th'
    : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th')

  const monthName = date.toLocaleDateString('en-AU', {
    month: 'long',
  })

  return `${day}${suffix} ${monthName} ${year}`
}

export default function ArcDateField({
  value = '',
  onChange,
  className = '',
  disabled = false,
  style,
  ...inputProps
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)

  const wrapperRef = useRef(null)
  const popupRef = useRef(null)
  const inputRef = useRef(null)

  const popupId = useId()

  useEffect(() => {
    if (!open) return undefined

    function updatePosition() {
      const rect = wrapperRef.current?.getBoundingClientRect()

      if (!rect) return

      const popupWidth = 280
      const popupHeight = 310
      const margin = 8

      const left = Math.max(
        margin,
        Math.min(
          rect.left,
          window.innerWidth - popupWidth - margin,
        ),
      )

      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top

      const top = (
        spaceBelow >= popupHeight + margin ||
        spaceBelow >= spaceAbove
      )
        ? rect.bottom + 4
        : Math.max(margin, rect.top - popupHeight - 4)

      setPosition({ left, top })
    }

    function dismiss(event) {
      if (
        wrapperRef.current?.contains(event.target) ||
        popupRef.current?.contains(event.target)
      ) {
        return
      }

      setOpen(false)
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape') return

      event.stopPropagation()
      setOpen(false)
      inputRef.current?.focus()
    }

    updatePosition()

    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', onKeyDown, true)

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', onKeyDown, true)

      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  function choose(date) {
    // Preserve the existing controlled-input contract.
    // Every existing form handler reads event.target.value.
    onChange?.({
      target: {
        value: date,
      },
    })

    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <span
      ref={wrapperRef}
      className="arc-date-field"
      style={style}
    >
      <input
        {...inputProps}
        ref={inputRef}
        type="date"
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="arc-date-field-native"
        tabIndex={-1}
        aria-hidden="true"
      />

      <button
        type="button"
        className={`${className} arc-date-field-value`}
        disabled={disabled}
        aria-label={
          `Choose ${inputProps['aria-label'] || 'date'}`
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        {formatDisplayDate(value)}
      </button>

      {value && !disabled && (
        <button
          type="button"
          className="arc-date-field-clear"
          aria-label={`Clear ${inputProps['aria-label'] || 'date'}`}
          title="Remove selected date"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onChange?.({ target: { value: '' } })
            setOpen(false)
          }}
        >
          <X size={15} />
        </button>
      )}

      <button
        type="button"
        className="arc-date-field-trigger"
        aria-label={
          `Open calendar for ${
            inputProps['aria-label'] || 'date'
          }`
        }
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarDays size={15} />
      </button>

      {open && position && createPortal(
        <div
          id={popupId}
          ref={popupRef}
          className="arc-date-field-popup"
          style={position}
        >
          <ArcDateCalendar
            anchor={value}
            onChoose={choose}
          />
        </div>,
        document.body,
      )}
    </span>
  )
}
