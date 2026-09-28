import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

function rowId(row) {
  return (
    row.item_id ??
    row.id
  )
}

function searchableText(
  row,
  path,
  includePath,
) {
  const tagText =
    (row.tags ?? [])
      .map(
        (tag) =>
          tag?.name ??
          tag,
      )
      .join(' | ')

  return [
    ...(
      includePath
        ? (
            path ?? []
          ).map(
            (item) =>
              item.title,
          )
        : []
    ),

    row.title,
    row.description,
    tagText,
    row.item_type,
    row.duration_category,
  ]
    .filter(Boolean)
    .join(' | ')
    .toLocaleLowerCase()
}

export default function usePriorityFind(
  rows,
  paths,
  {
    onNavigate,
    includePath = true,
  } = {},
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
              rowId(row),
              row,
            ],
          ),
        ),
      [
        rows,
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
                  rowId(row),
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
    activeId != null &&
    matchIds.has(
      activeId,
    )
      ? activeId
      : (
          matches[0] ??
          null
        )

  const index =
    currentId == null
      ? -1
      : matches.indexOf(
          currentId,
        )

  /*
   * A query with matches must never sit at 0/n.
   *
   * The active result is derived rather than repaired through setState.
   * This effect only synchronizes the Timeline viewport with that derived
   * result when the previous explicit selection is no longer valid.
   */
  useEffect(() => {
    if (
      !query.trim() ||
      currentId == null ||
      (
        activeId != null &&
        matchIds.has(
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

    card?.focus({
      preventScroll:
        true,
    })
  }, [
    currentId,
  ])

  function navigate(direction) {
    if (!matches.length) {
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
        base +
        direction +
        matches.length
      ) %
      matches.length

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

    card?.focus({
      preventScroll:
        true,
    })
  }

  return {
    query,
    matches,
    matchIds,
    index,
    currentId,
    navigate,

    changeQuery(value) {
      setQuery(value)
      setActiveId(null)
    },

    registerCard(
      id,
      node,
    ) {
      if (node) {
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
