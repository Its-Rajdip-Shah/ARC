import { useMarks } from '../../hooks/useMarks'
import { errorMessage } from '../../lib/errors'

function displayMark(value) {
  return value == null ? 'Not marked' : String(value)
}

/** FR-14: read actual marks returned by the authenticated backend only. */
export default function MarksPanel() {
  const marks = useMarks()
  const groups = Array.isArray(marks.data) ? marks.data : []

  if (marks.isPending) {
    return <p role="status" className="text-sm text-arc-text-secondary">Loading marks…</p>
  }

  if (marks.isError) {
    return (
      <div role="alert" className="rounded-xl border border-arc-danger p-4 text-sm">
        <p>Could not load marks. {errorMessage(marks.error)}</p>
        <button type="button" onClick={() => marks.refetch()} className="mt-3 rounded-lg bg-arc-blue px-4 py-2 font-semibold">Retry</button>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <p role="status" className="rounded-xl border border-[#4a496b] bg-arc-panel p-5 text-sm text-arc-text-secondary">
        No assessments to display yet. Add an assignment in Planner or sync your Canvas courses first.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-arc-text-secondary">
        Unmarked assessments are shown separately; they are not counted as zero.
      </p>
      {groups.map((group) => (
        <section key={group.root.id} className="rounded-xl border border-[#4a496b] bg-arc-panel p-4">
          <h3 className="text-lg font-semibold">{group.root.title}</h3>
          <p className="mt-1 text-sm text-arc-text-secondary">
            Recorded marks: {group.total_marks ?? '—'} · Total assessment weight: {group.total_weight ?? '—'}% · Unmarked: {group.unmarked_count ?? 0}
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="border-b border-[#4a496b] text-arc-text-secondary">
                <tr><th scope="col" className="pb-2 pr-3">Assessment</th><th scope="col" className="pb-2 pr-3">Weight</th><th scope="col" className="pb-2">Mark</th></tr>
              </thead>
              <tbody>
                {(group.assessments ?? []).map((item) => (
                  <tr key={item.id} className="border-b border-[#4a496b]/50 last:border-none">
                    <td className="py-3 pr-3">{item.title}</td>
                    <td className="py-3 pr-3">{item.weight_percent == null ? '—' : `${item.weight_percent}%`}</td>
                    <td className="py-3">{displayMark(item.mark_achieved)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
