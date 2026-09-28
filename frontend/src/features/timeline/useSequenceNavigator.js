import {
  useState,
} from 'react'

/*
 * Shared x/y + previous/next + activate-first navigation engine.
 *
 * Used by:
 *   - anchored tasks
 *   - overloaded dates
 *   - infeasible dates
 *
 * Search has its own text-matching layer but follows the same interaction
 * contract: a non-empty result set always has an active result.
 */
export default function useSequenceNavigator(
  values,
  onSelect,
) {
  const [
    storedIndex,
    setStoredIndex,
  ] = useState(-1)

  const index =
    !values.length ||
    storedIndex < 0
      ? -1
      : Math.min(
          storedIndex,
          values.length - 1,
        )

  function select(next) {
    if (
      next < 0 ||
      next >= values.length
    ) {
      return
    }

    setStoredIndex(next)

    onSelect?.(
      values[next],
    )
  }

  function activate() {
    if (!values.length) {
      setStoredIndex(-1)
      return
    }

    select(0)
  }

  function navigate(direction) {
    if (!values.length) {
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

    select(
      (
        base +
        direction +
        values.length
      ) %
      values.length,
    )
  }

  return {
    index,

    count:
      values.length,

    activate,
    navigate,

    reset() {
      setStoredIndex(-1)
    },
  }
}
