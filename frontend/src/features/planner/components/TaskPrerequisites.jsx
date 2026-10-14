import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addPrerequisite, listItems, listPrerequisites, removePrerequisite } from '../../../api/planning'

export default function TaskPrerequisites({ itemId, onBack }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')
  const cache = useQueryClient()
  const key = ['planning', 'prerequisites', itemId]
  const existing = useQuery({ queryKey: key, queryFn: () => listPrerequisites(itemId) })
  const candidates = useQuery({
    queryKey: ['planning', 'prerequisite-search', search],
    queryFn: () => listItems({ search }),
    enabled: Boolean(search.trim()),
  })
  const mutation = useMutation({
    mutationFn: ({ id, remove }) => remove
      ? removePrerequisite(itemId, id)
      : addPrerequisite(itemId, id),
    onSuccess: async (data) => {
      cache.setQueryData(key, data)
      setSelected('')
      await cache.invalidateQueries({ queryKey: ['planning'] })
    },
    onError: () => cache.invalidateQueries({ queryKey: ['planning'] }),
  })
  const rows = Array.isArray(candidates.data) ? candidates.data : candidates.data?.results ?? []
  const eligible = rows.filter((row) => row.id !== itemId
    && !(existing.data ?? []).some((edge) => edge.id === row.id))
  const busy = mutation.isPending

  return <section className="space-y-3 text-xs text-white" aria-label="Prerequisites">
    <h2>Prerequisites</h2>
    <p>Each Add or Remove saves immediately, separately from task details. Cycles and completion constraints are checked when adding.</p>
    {existing.isPending && <p role="status">Loading prerequisites…</p>}
    {(existing.isError || candidates.isError) && <p role="alert">Could not load tasks. <button type="button" onClick={() => { existing.refetch(); candidates.refetch() }}>Retry</button></p>}
    <ul>{(existing.data ?? []).map((row) => <li key={row.id}>
      {row.title} <button type="button" disabled={busy} onClick={() => mutation.mutate({ id: row.id, remove: true })}>Remove {row.title}</button>
    </li>)}</ul>
    <label>Search prerequisites
      <input value={search} onChange={(e) => { setSearch(e.target.value); setSelected('') }} className="w-full bg-[#383969] p-2" />
    </label>
    {candidates.isFetching && <p role="status">Searching…</p>}
    <label>Select prerequisite
      <select value={selected} onChange={(e) => setSelected(e.target.value)} className="w-full bg-[#383969] p-2">
        <option value="">Select a task</option>
        {eligible.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
      </select>
    </label>
    <button type="button" disabled={!selected || busy || !existing.isSuccess} onClick={() => mutation.mutate({ id: Number(selected) })}>Add prerequisite</button>
    {busy && <p role="status">Saving prerequisites…</p>}
    {mutation.isError && <p role="alert">{JSON.stringify(mutation.error?.response?.data ?? mutation.error?.message ?? 'Could not save prerequisite.')}</p>}
    <button type="button" disabled={busy} onClick={onBack}>Back to task details</button>
  </section>
}
