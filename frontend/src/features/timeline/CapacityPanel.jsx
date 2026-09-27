import { useState } from 'react'
import { BUCKETS } from './timelineDates'

export default function CapacityPanel({ capacities, actions, close }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(BUCKETS.map((b) => [b.field, capacities[b.key]])))
  async function save(event) {
    event.preventDefault()
    try {
      await actions.run('capacity', Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, Number(value)])))
      close()
    } catch { /* Shared action feedback remains visible; preserve the draft. */ }
  }
  return <form className="timeline-settings" onSubmit={save} aria-label="Daily automatic capacity">
    <strong>Daily automatic capacity</strong>
    <p>Slots per duration bucket, shared across all goals. Overload permission never increases these limits.</p>
    <div className="timeline-capacity-fields">{BUCKETS.map((b) => <label key={b.key}>{b.label}
      <input type="number" min="0" max="32767" required value={draft[b.field]} onChange={(e) => setDraft((s) => ({ ...s, [b.field]: e.target.value }))} />
    </label>)}</div>
    <button disabled={actions.busy} type="submit">{actions.busy ? 'Saving…' : 'Save capacity'}</button>
    <button type="button" onClick={close}>Close</button>
  </form>
}
