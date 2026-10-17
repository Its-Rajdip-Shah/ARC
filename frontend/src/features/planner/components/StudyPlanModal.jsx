import ArcDateField from '../../../components/ArcDateField'
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

import { useStudyPlan } from '../../../hooks/useStudyPlan'
import { errorMessage } from '../../../lib/errors'
import { sessionConflicts } from '../studyPlanConflicts'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const inputClass = `
  rounded-[10px] border border-[#2e286b] bg-[#383969]
  px-[10px] py-[7px] text-[13px] text-white outline-none
  focus:border-[#7c9cde]
`

const CONFLICT_LABELS = {
  outside_availability: 'Outside your availability',
  after_deadline: 'After the deadline',
}

function firstFieldMessage(fields) {
  if (Array.isArray(fields)) {
    for (const item of fields) {
      if (typeof item === 'string') return item
      const found = firstFieldMessage(item)
      if (found) return found
    }
    return null
  }
  if (!fields || typeof fields !== 'object') return null
  for (const value of Object.values(fields)) {
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
    const found = firstFieldMessage(value)
    if (found) return found
  }
  return null
}

function windowsFromAvailability(availability) {
  const rows = DAYS.map(() => ({ start: '', end: '' }))
  for (const window of availability || []) {
    if (window.weekday >= 0 && window.weekday < DAYS.length) {
      rows[window.weekday] = {
        start: String(window.start || '').slice(0, 5),
        end: String(window.end || '').slice(0, 5),
      }
    }
  }
  return rows
}

function notice(error) {
  const data = error?.response?.data
  if (typeof data?.error === 'string' && data.error) return data.error
  if (data?.error && typeof data.error === 'object') {
    return firstFieldMessage(data.error.fields) || data.error.message || errorMessage(error)
  }
  return errorMessage(error)
}

export default function StudyPlanModal({ onClose }) {
  const { result, loading, generate, save } = useStudyPlan()
  const [notes, setNotes] = useState('')
  const [windows, setWindows] = useState(() => DAYS.map(() => ({ start: '', end: '' })))
  const [availabilityTouched, setAvailabilityTouched] = useState(false)
  const preferences = result?.preferences
  const preferenceKey = preferences
    ? `${JSON.stringify(preferences.availability)}\n${preferences.notes || ''}`
    : null
  const [appliedPreferenceKey, setAppliedPreferenceKey] = useState(null)
  if (preferenceKey && preferenceKey !== appliedPreferenceKey && !availabilityTouched) {
    setAppliedPreferenceKey(preferenceKey)
    setWindows(windowsFromAvailability(preferences.availability))
    setNotes(preferences.notes || '')
  }
  const generatedAt = result?.plan?.generated_at
  const sessions = result?.plan?.sessions ?? []
  const [draft, setDraft] = useState(sessions)
  const [syncedAt, setSyncedAt] = useState(generatedAt)
  if (syncedAt !== generatedAt) {
    setSyncedAt(generatedAt)
    setDraft(sessions)
  }

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const banner = result?.error
    || (generate.isError ? notice(generate.error) : null)
    || (save.isError ? notice(save.error) : null)

  const availability = windows.flatMap((window, weekday) => (
    window.start && window.end
      ? [{ weekday, start: window.start.slice(0, 5), end: window.end.slice(0, 5) }]
      : []
  ))

  async function onGenerate(event) {
    event.preventDefault()
    try {
      await generate.mutateAsync({ availability, notes })
    } catch {
      // The banner reads generate.error. Planner queries are left alone.
    }
  }

  async function onSave() {
    try {
      await save.mutateAsync({
        sessions: draft.map((session) => ({
          item_id: session.item_id,
          date: session.date,
          start_time: String(session.start_time).slice(0, 5),
          duration_minutes: Number(session.duration_minutes),
          order: session.order,
        })),
      })
    } catch {
      // The banner reads save.error.
    }
  }

  function editSession(index, field, value) {
    setDraft((rows) => rows.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close study plan"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-plan-title"
        className="
          relative z-10 m-4 flex max-h-[85vh] w-full max-w-lg flex-col
          overflow-y-auto rounded-[15px] bg-arc-panel p-4 text-arc-text
        "
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="study-plan-title" className="text-[16px] font-semibold">
              Study plan
            </h2>
            <p className="text-[12px] text-arc-text-muted">
              A suggestion you can edit. It does not change your planner.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-arc-text-muted hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onGenerate} noValidate className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[12px] text-arc-text-muted">
              When you can study. Leave a day blank to skip it. If start and end match, the window has no length and sessions are flagged as outside your availability.
            </legend>
            {DAYS.map((label, weekday) => (
              <div key={label} className="grid grid-cols-[3rem_1fr_1fr_auto] items-center gap-2">
                <span className="text-[12px]">{label}</span>
                <input
                  type="time"
                  aria-label={`${label} start`}
                  value={windows[weekday].start}
                  onChange={(event) => {
                    setAvailabilityTouched(true)
                    setWindows((rows) => rows.map((row, index) => (
                      index === weekday ? { ...row, start: event.target.value } : row
                    )))
                  }}
                  className={inputClass}
                />
                <input
                  type="time"
                  aria-label={`${label} end`}
                  value={windows[weekday].end}
                  onChange={(event) => {
                    setAvailabilityTouched(true)
                    setWindows((rows) => rows.map((row, index) => (
                      index === weekday ? { ...row, end: event.target.value } : row
                    )))
                  }}
                  className={inputClass}
                />
                <button
                  type="button"
                  aria-label={`Clear ${label}`}
                  onClick={() => {
                    setAvailabilityTouched(true)
                    setWindows((rows) => rows.map((row, index) => (
                      index === weekday ? { start: '', end: '' } : row
                    )))
                  }}
                  className="text-[12px] text-arc-text-muted hover:text-white"
                >
                  Clear
                </button>
              </div>
            ))}
          </fieldset>

          <label className="flex flex-col gap-1 text-[12px] text-arc-text-muted">
            Note for the suggestion
            <input
              value={notes}
              onChange={(event) => {
                setAvailabilityTouched(true)
                setNotes(event.target.value)
              }}
              maxLength={500}
              className={inputClass}
            />
          </label>

          <button
            type="submit"
            disabled={generate.isPending}
            className="
              h-[32px] rounded-[10px] bg-arc-blue-light text-[13px]
              font-medium text-[#171a36] disabled:opacity-60
            "
          >
            {generate.isPending ? 'Requesting…' : 'Suggest a plan'}
          </button>
        </form>

        {result?.source === 'local' && result?.plan && !result?.error && (
          <p className="mt-3 text-[13px] text-arc-text-muted">
            No model key is set, so this plan is ordered from your deadlines.
          </p>
        )}

        {banner && (
          <p role="alert" className="mt-3 text-[13px] text-arc-danger-light">
            {banner}
            {result?.source === 'cache' && result?.plan
              ? ' Showing your last saved plan.'
              : ''}
            {result?.source === 'local' && result?.plan
              ? ' Showing a deadline order instead.'
              : ''}
          </p>
        )}

        {loading && <p className="mt-3 text-[13px] text-arc-text-muted">Loading saved plan…</p>}

        {!loading && draft.length === 0 && !banner && (
          <p className="mt-3 text-[13px] text-arc-text-muted">No saved plan yet.</p>
        )}

        {draft.length > 0 && (
          <ul className="mt-3 flex flex-col gap-3">
            {draft.map((session, index) => {
              const conflicts = sessionConflicts(session, availability)
              return (
              <li key={`${session.item_id}-${index}`} className="rounded-[10px] bg-arc-panel-light p-3">
                <p className="mb-2 text-[13px]">
                  {session.order}. {session.title}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <ArcDateField
                    type="date"
                    aria-label={`${session.title} date`}
                    value={session.date}
                    onChange={(event) => editSession(index, 'date', event.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="time"
                    aria-label={`${session.title} start time`}
                    value={session.start_time}
                    onChange={(event) => editSession(index, 'start_time', event.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="number"
                    min="1"
                    aria-label={`${session.title} duration in minutes`}
                    value={session.duration_minutes}
                    onChange={(event) => editSession(index, 'duration_minutes', event.target.value)}
                    className={inputClass}
                  />
                </div>
                {conflicts.length > 0 && (
                  <p className="mt-2 text-[12px] text-arc-accent">
                    {conflicts.map((flag) => CONFLICT_LABELS[flag] ?? flag).join(' · ')}
                  </p>
                )}
              </li>
              )
            })}
          </ul>
        )}

        {draft.length > 0 && (
          <button
            type="button"
            onClick={onSave}
            disabled={save.isPending}
            className="
              mt-3 h-[32px] rounded-[10px] border border-arc-blue-light
              text-[13px] text-arc-blue-light disabled:opacity-60
            "
          >
            {save.isPending ? 'Saving…' : 'Save edits'}
          </button>
        )}
      </section>
    </div>
  )
}
