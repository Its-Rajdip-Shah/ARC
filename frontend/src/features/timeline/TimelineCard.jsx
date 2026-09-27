import { BUCKETS, todayKey } from './timelineDates'

export default function TimelineCard({
  item,
  find,
  actions,
  flat,
  readOnly = false,
  expanded = false,
}) {
  const bucket = BUCKETS.find((b) => b.key === item.duration_category)
  const path = item.hierarchy_path?.filter((p) => flat || p.id !== item.root.id).map((p) => p.title).join(' / ')
  return <article tabIndex={-1} ref={readOnly ? undefined : (node) => find.registerCard(item.id, node)}
    className={
      'timeline-card ' +
      (item.scheduled_date === todayKey() ? 'timeline-today ' : '') +
      (find.matchIds.has(item.id) ? 'priority-match ' : '') +
      (find.currentId === item.id ? 'priority-current-match ' : '') +
      (expanded ? 'timeline-card-expanded ' : '')
    }
    aria-label={item.title + ', ' + (item.scheduled_date ? 'scheduled ' + item.scheduled_date : 'not scheduled')}>
    <div className="timeline-card-main">
      <input type="checkbox" checked={item.is_completed} disabled={readOnly || actions.busy} aria-label={'Complete ' + item.title}
        onChange={() => !readOnly && actions.run('complete', { id: item.id, completed: !item.is_completed }).catch(() => {})} />
      <span className="timeline-card-title">{item.title}</span>
      <span className="timeline-duration" title={bucket?.label} aria-label={bucket?.label}>{bucket?.dots}</span>
    </div>
    <div className="timeline-card-details">
      <p>{path || item.root.title}</p>
      <p>{item.priority_position != null ? '#' + item.priority_position + ' · ' : ''}{item.item_type === 'ASSIGNMENT' ? 'Assignment' : 'Task'} · {bucket?.label}</p>
      <p>{item.scheduled_date ? 'Scheduled ' + item.scheduled_date : 'Not scheduled'}{item.overdue ? ' · Overdue' : ''}</p>
      {(item.start_date || item.due_date) && <p>{item.start_date ? 'Release ' + item.start_date : ''}{item.start_date && item.due_date ? ' · ' : ''}{item.due_date ? 'Due ' + item.due_date : ''}</p>}
    </div>
  </article>
}
