import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

function defaultRowId(
  row,
) {
  return (
    row.item_id
    ?? row.id
  )
}

export default function useSearchNavigation(
  rows,
  paths,
  {
    onNavigate,
    includePath = true,
    focusResult = true,
    rowId = defaultRowId,
    searchableText,
  },
) {
  const [
    query,
    setQuery,
  ] = useState('')

  const [
    activeId,
    setActiveId,
  ] = useState(null)

  const cards =
    useRef(
      new Map(),
    )

  const navigateRef =
    useRef(
      onNavigate,
    )

  useEffect(() => {
    navigateRef.current =
      onNavigate
  }, [
    onNavigate,
  ])

  const rowById =
    useMemo(
      () =>
        new Map(
          rows.map(
            (row) => [
              rowId(
                row,
              ),
              row,
            ],
          ),
        ),
      [
        rows,
        rowId,
      ],
    )

  const matches =
    useMemo(
      () => {
        const needle =
          query
            .trim()
            .toLocaleLowerCase()

        if (!needle) {
          return []
        }

        return rows
          .filter(
            (row) =>
              searchableText(
                row,
                paths.get(
                  rowId(
                    row,
                  ),
                ),
                includePath,
              ).includes(
                needle,
              ),
          )
          .map(
            rowId,
          )
      },
      [
        rows,
        paths,
        query,
        includePath,
        rowId,
        searchableText,
      ],
    )

  const matchIds =
    useMemo(
      () =>
        new Set(
          matches,
        ),
      [
        matches,
      ],
    )

  const currentId =
    activeId != null
    && matchIds.has(
      activeId,
    )
      ? activeId
      : (
          matches[0]
          ?? null
        )

  const index =
    currentId == null
      ? -1
      : matches.indexOf(
          currentId,
        )

  useEffect(() => {
    if (
      !query.trim()
      || currentId == null
      || (
        activeId != null
        && matchIds.has(
          activeId,
        )
      )
    ) {
      return
    }

    navigateRef.current?.(
      rowById.get(
        currentId,
      ),
    )
  }, [
    query,
    currentId,
    activeId,
    matchIds,
    rowById,
  ])

  useEffect(() => {
    const card =
      cards.current.get(
        currentId,
      )

    card?.scrollIntoView({
      block:
        'nearest',

      inline:
        'nearest',
    })

    if (
      focusResult
    ) {
      card?.focus({
        preventScroll:
          true,
      })
    }
  }, [
    currentId,
    focusResult,
  ])

  function navigate(
    direction,
  ) {
    if (
      !matches.length
    ) {
      return
    }

    const base =
      index >= 0
        ? index
        : (
            direction > 0
              ? -1
              : 0
          )

    const nextIndex =
      (
        base
        + direction
        + matches.length
      )
      % matches.length

    const nextId =
      matches[
        nextIndex
      ]

    setActiveId(
      nextId,
    )

    navigateRef.current?.(
      rowById.get(
        nextId,
      ),
    )

    const card =
      cards.current.get(
        nextId,
      )

    card?.scrollIntoView({
      block:
        'nearest',

      inline:
        'nearest',
    })

    if (
      focusResult
    ) {
      card?.focus({
        preventScroll:
          true,
      })
    }
  }

  return {
    query,
    matches,
    matchIds,
    index,
    currentId,
    navigate,

    changeQuery(
      value,
    ) {
      setQuery(
        value,
      )

      setActiveId(
        null,
      )
    },

    registerCard(
      id,
      node,
    ) {
      if (
        node
      ) {
        cards.current.set(
          id,
          node,
        )
      } else {
        cards.current.delete(
          id,
        )
      }
    },
  }
}
