import { Check } from 'lucide-react'
import arcLogo from '../../assets/brand/arc-logo.svg'

export default function TimelineSidebar({ roots, selected, toggle, loading, error, retry }) {
  return <aside className="timeline-sidebar" aria-label="Timeline root filters">
    <img src={arcLogo} alt="ARC" className="timeline-sidebar-logo" />
    <h2>ROOTS</h2>
    {loading && <p role="status">Loading roots…</p>}
    {error && <button onClick={retry}>Retry root list</button>}
    <nav aria-label="Filter by root goal">
      {roots.map((root) => <button key={root.id} aria-pressed={selected.includes(root.id)} title={root.title}
        onClick={() => toggle(root.id)}>
        <span>{root.title}</span>{selected.includes(root.id) && <Check size={14} aria-hidden="true" />}
      </button>)}
    </nav>
  </aside>
}
