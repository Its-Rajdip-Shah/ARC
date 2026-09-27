import { useEffect, useMemo, useRef, useState } from 'react'

export default function usePriorityFind(rows, paths) {
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState(null)
  const cards = useRef(new Map())
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return []
    return rows.filter((row) => [...(paths.get(row.item_id) ?? []).map((item) => item.title), row.title]
      .join(' | ').toLocaleLowerCase().includes(needle)).map((row) => row.item_id)
  }, [rows, paths, query])
  const foundIndex = matches.indexOf(activeId)
  const index = matches.length ? Math.max(0, foundIndex) : -1
  const currentId = matches[index] ?? null
  const matchIds = useMemo(() => new Set(matches), [matches])

  useEffect(() => {
    // Keep typing focus in the search field; only explicit navigation moves focus.
    cards.current.get(currentId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [currentId])

  function navigate(direction) {
    if (!matches.length) return
    const nextId = matches[(index + direction + matches.length) % matches.length]
    setActiveId(nextId)
    const card = cards.current.get(nextId)
    card?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    card?.focus({ preventScroll: true })
  }

  return {
    query, matches, matchIds, index, currentId, navigate,
    changeQuery(value) { setQuery(value); setActiveId(null) },
    registerCard(id, node) {
      if (node) cards.current.set(id, node)
      else cards.current.delete(id)
    },
  }
}
